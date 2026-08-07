import { query, withTransaction } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';
import { ADAPTERS } from '../services/paymentProviders.js';
import crypto from 'crypto';
import { cached, cacheDel } from '../utils/cache.js';
import { creditSaleCommission, alertHeldSaleCommission } from '../services/affiliateService.js';
import { createOrderConfirmation, createDigitalReceipt, createDeliveryReceipt, createRefundReceipt, createPaymentConfirmation } from '../services/documentService.js';

// Document generation must never break the payment/escrow flow it's hooked
// into — a receipt failing to render is a bug to fix, not a reason to fail
// someone's checkout. Every hook below is wrapped with this.
async function safeGenerateDocument(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`Document generation failed (${label}):`, err);
    return null;
  }
}

async function logWalletTransaction(client, { walletId, direction, amount, balanceAfter, referenceType, referenceId, note, createdBy }) {
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [walletId, direction, amount, balanceAfter, referenceType, referenceId || null, note || null, createdBy || null]
  );
}

// Read on every single order creation, but changes only when an admin
// edits platform settings — a 30s cache removes a repeated round trip from
// the checkout hot path without making admin changes take meaningfully
// long to show up. Call invalidateSettingsCache() wherever settings are
// written (see settingsService.js) to avoid even that 30s staleness.
async function getSettings() {
  return cached('platform_settings', 30_000, async () => {
    const r = await query('SELECT * FROM platform_settings WHERE id = 1');
    return r.rows[0];
  });
}

export function invalidateSettingsCache() {
  cacheDel('platform_settings');
}

// Buyer initiates checkout for a product -> creates an order in pending_payment.
export async function createOrder(req, res) {
  const { productId, quantity = 1, shippingAddress, method, couponCode } = req.body;
  if (!productId || !method) return res.status(400).json({ error: 'Product and payment method are required.' });

  try {
    // A double-tapped "Buy now" (or a retried request) within the same
    // couple of seconds gets the just-created order handed back instead of
    // a second one — prevents duplicate pending orders (and, if the buyer
    // then completes payment on both, a double payment) for one click.
    const inFlight = await query(
      `SELECT * FROM orders WHERE buyer_id = $1 AND product_id = $2 AND status = 'pending_payment'
         AND checkout_group_id IS NULL AND created_at > now() - interval '10 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, productId]
    );
    if (inFlight.rows.length > 0) {
      const existingPayment = await query('SELECT provider_reference FROM payments WHERE order_id = $1', [inFlight.rows[0].id]);
      return res.status(200).json({
        message: 'Order already created. Complete payment to move funds into escrow.',
        order: inFlight.rows[0],
        providerReference: existingPayment.rows[0]?.provider_reference
      });
    }

    const adapter = ADAPTERS[method];
    if (!adapter) return res.status(400).json({ error: 'Unsupported payment method.' });

    const order = await withTransaction(async (client) => {
      // Row lock held for the stock check + order insert so two concurrent
      // purchases of the last unit of the same product can't both pass.
      const productResult = await client.query(
        `SELECT p.*, s.id AS shop_id, u.primary_role AS shop_owner_role
         FROM products p JOIN shops s ON s.id = p.shop_id JOIN users u ON u.id = s.owner_id
         WHERE p.id = $1 AND p.status = 'active' FOR UPDATE OF p`,
        [productId]
      );
      const product = productResult.rows[0];
      if (!product) { const err = new Error('PRODUCT_NOT_FOUND'); err.code = 'PRODUCT_NOT_FOUND'; throw err; }
      if (product.quantity_available < quantity) { const err = new Error('OUT_OF_STOCK'); err.code = 'OUT_OF_STOCK'; throw err; }
      // Manufacturers/suppliers/farmers are bulk-only — a retail-sized single
      // order is rejected outright so the buyer is pointed at the bulk order /
      // request-quote flow instead (see b2b/quoteController.js).
      if (['manufacturer', 'supplier', 'farmer'].includes(product.shop_owner_role) && quantity < product.minimum_order_quantity) {
        const err = new Error('MOQ_NOT_MET'); err.code = 'MOQ_NOT_MET'; err.moq = product.minimum_order_quantity; throw err;
      }

      const settings = await getSettings();
      const feePercent = Number(settings.platform_fee_percent);
      const unitPrice = Number(product.price);
      const subtotal = unitPrice * quantity;

      // Coupon redemption: validated and locked (FOR UPDATE) inside this
      // same transaction, then uses_count is incremented atomically with
      // the overuse guard baked into the WHERE clause — so two concurrent
      // checkouts racing on the last remaining use can't both redeem it,
      // and a coupon actually gets consumed instead of being infinitely
      // reusable. Previously coupons/validate computed a discount that was
      // never applied to an order and never decremented remaining uses.
      let coupon = null;
      let discount = 0;
      if (couponCode) {
        const couponResult = await client.query(
          `SELECT * FROM coupons WHERE code = $1 AND (shop_id = $2 OR shop_id IS NULL) AND is_active = TRUE
             AND (expires_at IS NULL OR expires_at > now()) FOR UPDATE`,
          [couponCode.toUpperCase(), product.shop_id]
        );
        coupon = couponResult.rows[0];
        if (!coupon) { const err = new Error('COUPON_INVALID'); err.code = 'COUPON_INVALID'; throw err; }
        if (subtotal < Number(coupon.min_order_amount)) {
          const err = new Error('COUPON_MIN_ORDER'); err.code = 'COUPON_MIN_ORDER'; err.minOrderAmount = coupon.min_order_amount; throw err;
        }
        const redeemed = await client.query(
          `UPDATE coupons SET uses_count = uses_count + 1
           WHERE id = $1 AND (max_uses IS NULL OR uses_count < max_uses) RETURNING *`,
          [coupon.id]
        );
        if (redeemed.rows.length === 0) { const err = new Error('COUPON_EXHAUSTED'); err.code = 'COUPON_EXHAUSTED'; throw err; }
        coupon = redeemed.rows[0];
        discount = coupon.discount_type === 'percent'
          ? Math.round(subtotal * (Number(coupon.discount_value) / 100) * 100) / 100
          : Math.min(Number(coupon.discount_value), subtotal);
      }

      const discountedSubtotal = subtotal - discount;
      const feeAmount = Math.round(discountedSubtotal * feePercent) / 100;
      const total = discountedSubtotal + feeAmount;

      const orderResult = await client.query(
        `INSERT INTO orders (buyer_id, shop_id, product_id, quantity, unit_price, currency, platform_fee_percent, platform_fee_amount, total_amount, shipping_address, coupon_id, coupon_code, discount_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [req.user.id, product.shop_id, product.id, quantity, unitPrice, product.currency, feePercent, feeAmount, total, shippingAddress || null, coupon?.id || null, coupon?.code || null, discount]
      );
      return orderResult.rows[0];
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const charge = await adapter({
      amount: order.total_amount, currency: order.currency, orderId: order.id,
      returnUrl: `${frontendUrl}/orders/${order.id}`
    });

    await query(
      `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
       VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
      [order.id, method, order.total_amount, order.currency, charge.providerReference, charge.raw]
    );

    await safeGenerateDocument(() => createOrderConfirmation(order.id), 'order_confirmation:createOrder');

    return res.status(201).json({
      message: 'Order created. Complete payment to move funds into escrow.',
      order, checkoutUrl: charge.checkoutUrl, providerReference: charge.providerReference
    });
  } catch (err) {
    if (err.code === 'PRODUCT_NOT_FOUND') return res.status(404).json({ error: 'Product not available.' });
    if (err.code === 'OUT_OF_STOCK') return res.status(400).json({ error: 'Not enough stock available.' });
    if (err.code === 'MOQ_NOT_MET') return res.status(400).json({ error: `This is a bulk-only listing — minimum order is ${err.moq} units. Request a quote instead if you need a smaller amount.`, minimumOrderQuantity: err.moq });
    if (err.code === 'COUPON_INVALID') return res.status(404).json({ error: 'Invalid or expired coupon code.' });
    if (err.code === 'COUPON_MIN_ORDER') return res.status(400).json({ error: `This coupon requires a minimum order of ${err.minOrderAmount}.` });
    if (err.code === 'COUPON_EXHAUSTED') return res.status(409).json({ error: 'This coupon has just reached its usage limit.' });
    console.error('Create order error:', err);
    return res.status(500).json({ error: 'Could not create order.' });
  }
}

// Core escrow-crediting transaction, shared by the REST confirm-payment
// endpoint below (sandbox/dev-only path) and the signature-verified
// provider webhooks in paymentWebhooksController.js (the real,
// production path). Never exported to a route directly — every caller
// must go through one of those two, both of which establish trust
// before calling this.
export async function applyPaymentConfirmation(orderId, { userId, confirmedVia } = {}) {
  const result = await withTransaction(async (client) => {
    // Atomic status flip: only the first call for this order can move it
    // out of pending_payment, so a retried webhook (a normal thing
    // payment providers do) can't credit escrow twice for one order.
    const settingsResult = await client.query('SELECT escrow_protection_days FROM platform_settings WHERE id = 1');
    const protectionDays = settingsResult.rows[0]?.escrow_protection_days ?? 7;

    const flipped = await client.query(
      `UPDATE orders SET status = 'paid_escrow', protection_period_ends_at = now() + ($2 || ' days')::interval
       WHERE id = $1 AND status = 'pending_payment' RETURNING *`,
      [orderId, protectionDays]
    );
    if (flipped.rows.length === 0) {
      const existing = await client.query('SELECT id FROM orders WHERE id = $1', [orderId]);
      if (existing.rows.length === 0) {
        const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err;
      }
      const err = new Error('ALREADY_PROCESSED'); err.code = 'ALREADY_PROCESSED'; throw err;
    }
    const order = flipped.rows[0];

    await client.query(`UPDATE payments SET status = 'succeeded' WHERE order_id = $1`, [orderId]);

    const escrowWallet = await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE type = 'escrow' RETURNING *`,
      [order.total_amount]
    );
    await logWalletTransaction(client, {
      walletId: escrowWallet.rows[0].id, direction: 'credit', amount: order.total_amount, balanceAfter: escrowWallet.rows[0].balance,
      referenceType: 'order_escrow', referenceId: order.id, note: `Buyer payment held in escrow (confirmed via ${confirmedVia || 'unknown'})`, createdBy: userId || order.buyer_id
    });

    await client.query(
      `INSERT INTO escrow_ledger (order_id, direction, amount, note, created_by) VALUES ($1,'in',$2,$3,$4)`,
      [orderId, order.total_amount, `Buyer payment held in escrow (confirmed via ${confirmedVia || 'unknown'})`, userId || order.buyer_id]
    );
    await client.query(
      `UPDATE products SET quantity_available = quantity_available - $1, orders_count = orders_count + 1 WHERE id = $2`,
      [order.quantity, order.product_id]
    );

    const shopResult = await client.query('SELECT owner_id FROM shops WHERE id = $1', [order.shop_id]);
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'new_order','New order received','You have a new paid order waiting to be fulfilled.')`,
      [shopResult.rows[0].owner_id]
    );

    return order;
  });

  const paymentRow = await query('SELECT method FROM payments WHERE order_id = $1 LIMIT 1', [orderId]);
  await safeGenerateDocument(
    () => createDigitalReceipt(orderId, { paymentMethod: paymentRow.rows[0]?.method || null }),
    'digital_receipt:confirmPayment'
  );
  await safeGenerateDocument(
    () => createPaymentConfirmation(orderId, {
      direction: 'escrow_hold', amount: result.total_amount, recipientId: result.buyer_id,
      note: 'Buyer payment received and held in Jedida escrow.'
    }),
    'payment_confirmation:confirmPayment'
  );

  return result;
}

// REST endpoint kept only for the sandbox/no-provider-keys-configured
// development flow described in the original comment here — it is NOT
// how real payments get confirmed once live provider keys are set. It
// used to accept any orderId from any authenticated user with no
// ownership check and no payment verification whatsoever, which meant
// anyone could mark any order "paid" without paying anything. It now:
//   1. requires the caller to be the order's buyer, and
//   2. refuses to run at all unless the order's payment is still a
//      sandbox reference (see paymentProviders.js's sandbox() fallback)
//      — i.e. no real provider key was configured for that charge. Once
//      a real provider key is set, this route 403s and the order can
//      only be confirmed by that provider's signature-verified webhook
//      (see routes/paymentWebhooks.js).
export async function confirmPayment(req, res) {
  const { orderId } = req.params;
  try {
    const orderCheck = await query('SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
    if (orderCheck.rows[0].buyer_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only confirm payment on your own order.' });
    }

    const paymentCheck = await query('SELECT provider_reference FROM payments WHERE order_id = $1 LIMIT 1', [orderId]);
    const ref = paymentCheck.rows[0]?.provider_reference || '';
    if (!/-SANDBOX-/.test(ref)) {
      return res.status(403).json({
        error: 'This order was charged through a live payment provider. Payment confirmation must come from the provider, not this endpoint.'
      });
    }

    const result = await applyPaymentConfirmation(orderId, { userId: req.user.id, confirmedVia: 'sandbox_manual' });
    return res.json({ message: 'Payment confirmed. Funds are held in escrow until delivery is confirmed.', order: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    if (err.code === 'ALREADY_PROCESSED') return res.status(409).json({ error: 'This payment has already been confirmed.' });
    console.error('Confirm payment error:', err);
    return res.status(500).json({ error: 'Could not confirm payment.' });
  }
}

// Buyer, seller, AND delivery personnel each click "delivered" — once all
// three relevant confirmations are in, the order is marked completed and
// queued for the admin to release escrow funds.
export async function confirmDelivery(req, res) {
  const { orderId } = req.params;
  const userId = req.user.id;

  try {
    const orderResult = await query('SELECT o.*, s.owner_id AS seller_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = $1', [orderId]);
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    let column = null;
    if (userId === order.buyer_id) column = 'buyer_confirmed_delivery';
    else if (userId === order.seller_id) column = 'seller_confirmed_delivery';
    else if (userId === order.delivery_personnel_id) column = 'delivery_confirmed';
    else return res.status(403).json({ error: 'You are not a party to this order.' });

    const updated = await query(`UPDATE orders SET ${column} = TRUE WHERE id = $1 RETURNING *`, [orderId]);
    const o = updated.rows[0];

    const allConfirmed = o.buyer_confirmed_delivery && o.seller_confirmed_delivery &&
      (o.delivery_personnel_id ? o.delivery_confirmed : true);

    if (allConfirmed && o.status !== 'completed') {
      await query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [orderId]);
      await query(
        `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system_announcement','Order ready for payout','All parties confirmed delivery — awaiting admin fund release.')`,
        [order.seller_id]
      );
      await safeGenerateDocument(() => createDeliveryReceipt(orderId), 'delivery_receipt:confirmDelivery');
    } else {
      await query(`UPDATE orders SET status = 'shipped' WHERE id = $1 AND status = 'paid_escrow'`, [orderId]);
    }

    return res.json({ message: 'Delivery confirmation recorded.', order: o, allConfirmed });
  } catch (err) {
    console.error('Confirm delivery error:', err);
    return res.status(500).json({ error: 'Could not record delivery confirmation.' });
  }
}

// Admin releases escrowed funds to the seller's wallet (platform fee stays
// in the platform wallet — it was already separated out at checkout).
// Shared payout core used by both the single-order admin release endpoint
// and the protection-period auto-release sweep below. `client` must already
// be inside a transaction. Assumes the caller has already atomically claimed
// the order (set funds_released_at) before calling this — this function
// only moves the money and writes the audit trail.
async function payOutClaimedOrder(client, order, releasedBy, releaseNote) {
  const sellerAmount = Number(order.total_amount) - Number(order.platform_fee_amount);

  const escrowWallet = await client.query(
    `UPDATE wallets SET balance = balance - $1 WHERE type = 'escrow' AND balance >= $1 RETURNING *`,
    [order.total_amount]
  );
  if (escrowWallet.rows.length === 0) {
    // Should never happen if confirmPayment ran correctly, but never let
    // escrow go negative regardless — surface it instead.
    const err = new Error('ESCROW_INSUFFICIENT'); err.code = 'ESCROW_INSUFFICIENT'; throw err;
  }
  await logWalletTransaction(client, {
    walletId: escrowWallet.rows[0].id, direction: 'debit', amount: order.total_amount, balanceAfter: escrowWallet.rows[0].balance,
    referenceType: 'order_release', referenceId: order.id, note: releaseNote, createdBy: releasedBy
  });

  const sellerWallet = await client.query(
    `UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2 AND type = 'user' RETURNING *`,
    [sellerAmount, order.seller_id]
  );
  await logWalletTransaction(client, {
    walletId: sellerWallet.rows[0].id, direction: 'credit', amount: sellerAmount, balanceAfter: sellerWallet.rows[0].balance,
    referenceType: 'order_release', referenceId: order.id, note: 'Order payout', createdBy: releasedBy
  });

  const platformWallet = await client.query(
    `UPDATE wallets SET balance = balance + $1 WHERE type = 'platform' RETURNING *`,
    [order.platform_fee_amount]
  );
  await logWalletTransaction(client, {
    walletId: platformWallet.rows[0].id, direction: 'credit', amount: order.platform_fee_amount, balanceAfter: platformWallet.rows[0].balance,
    referenceType: 'platform_fee', referenceId: order.id, note: 'Platform commission', createdBy: releasedBy
  });

  await client.query(
    `INSERT INTO escrow_ledger (order_id, direction, amount, note, created_by) VALUES ($1,'out',$2,$3,$4)`,
    [order.id, order.total_amount, releaseNote, releasedBy]
  );
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'payout_released','Funds released',$2,$3)`,
    [order.seller_id, `${sellerAmount} ${order.currency} has been released to your wallet for order ${order.id}.`, releasedBy]
  );

  // Never throws — a failure here must not undo a real payout that already
  // happened above in this same transaction.
  const commission = await creditSaleCommission(client, order);
  await alertHeldSaleCommission(commission);

  return { sellerAmount };
}

export async function releaseFunds(req, res) {
  const { orderId } = req.params;
  try {
    const result = await withTransaction(async (client) => {
      // Atomic, single-use guard: funds_released_at can only be set once,
      // by whichever call gets here first. Previously this endpoint just
      // checked status === 'completed' and never recorded that a payout
      // had already happened, so calling it a second time (double-click,
      // retried request, replayed admin action) released the same escrow
      // hold to the seller again — a duplicate-payout bug. Now a second
      // call gets rowCount 0 and a 409, not a second payment.
      const claimed = await client.query(
        `UPDATE orders o SET funds_released_at = now()
         FROM shops s
         WHERE o.id = $1 AND o.shop_id = s.id AND o.status = 'completed' AND o.funds_released_at IS NULL
         RETURNING o.*, s.owner_id AS seller_id`,
        [orderId]
      );
      if (claimed.rows.length === 0) {
        const existing = await client.query('SELECT id, status, funds_released_at FROM orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        if (existing.rows[0].funds_released_at) { const err = new Error('ALREADY_RELEASED'); err.code = 'ALREADY_RELEASED'; throw err; }
        const err = new Error('NOT_COMPLETED'); err.code = 'NOT_COMPLETED'; throw err;
      }
      const order = claimed.rows[0];
      const payout = await payOutClaimedOrder(client, order, req.user.id, 'Funds released to seller by admin');
      await logSecurityEvent(client, {
        actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
        eventType: 'order_funds_released', entityType: 'order', entityId: order.id,
        metadata: { sellerAmount: payout.sellerAmount, sellerId: order.seller_id, ip: req.ip },
      });
      return { ...payout, dropshipperId: order.dropshipper_id };
    });

    // Dropship orders (see dropshipController.js) still need a separate
    // POST /api/dropship/orders/:orderId/release-commission call — this
    // endpoint only pays the business (seller) their full amount; the
    // commission carve-out to the dropshipper is a distinct, auditable step.
    return res.json({
      message: result.dropshipperId
        ? 'Funds released to the business. This order has a pending dropship commission — release it separately.'
        : 'Funds released to seller.',
      sellerAmount: result.sellerAmount,
      dropshipCommissionPending: Boolean(result.dropshipperId)
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    if (err.code === 'ALREADY_RELEASED') return res.status(409).json({ error: 'Funds for this order have already been released.' });
    if (err.code === 'NOT_COMPLETED') return res.status(400).json({ error: 'Order must be completed (all deliveries confirmed) first.' });
    if (err.code === 'ESCROW_INSUFFICIENT') return res.status(500).json({ error: 'Escrow balance inconsistency detected — release blocked, contact engineering.' });
    console.error('Release funds error:', err);
    return res.status(500).json({ error: 'Could not release funds.' });
  }
}

// Second approved release workflow: once a buyer's protection period has
// expired without a dispute, escrow is released to the seller even if the
// buyer never explicitly confirmed delivery. Intended to be invoked by a
// scheduled job (see server.js) and is also exposed to admins as a manual
// "run the sweep now" action — both call this same guarded logic, so there
// is only one code path that can ever move this money.
//
// Orders under an open dispute are excluded — a dispute means a human needs
// to resolve it (via releaseFunds or adminRefundOrder), so time alone must
// never auto-release those funds.
const AUTO_RELEASE_ELIGIBLE_STATUSES = ['paid_escrow', 'shipped', 'delivered_confirmed', 'completed'];

export async function autoReleaseExpiredEscrow(req, res) {
  try {
    const summary = await withTransaction(async (client) => {
      const eligible = await client.query(
        `SELECT o.id FROM orders o
         WHERE o.status = ANY($1::order_status[])
           AND o.funds_released_at IS NULL
           AND o.protection_period_ends_at IS NOT NULL
           AND o.protection_period_ends_at < now()
         ORDER BY o.protection_period_ends_at ASC
         LIMIT 200
         FOR UPDATE OF o SKIP LOCKED`,
        [AUTO_RELEASE_ELIGIBLE_STATUSES]
      );

      let released = 0;
      let totalReleased = 0;
      const errors = [];

      for (const row of eligible.rows) {
        // Re-claim each order individually with the same single-use guard
        // used everywhere else — belt-and-braces against another release
        // (admin or another sweep run) landing on it between the SELECT
        // above and this UPDATE.
        const claimed = await client.query(
          `UPDATE orders o SET funds_released_at = now(), status = 'completed'
           FROM shops s
           WHERE o.id = $1 AND o.shop_id = s.id AND o.funds_released_at IS NULL
           RETURNING o.*, s.owner_id AS seller_id`,
          [row.id]
        );
        if (claimed.rows.length === 0) continue;
        try {
          const { sellerAmount } = await payOutClaimedOrder(
            client, claimed.rows[0], req.user?.id || null,
            'Escrow auto-released — buyer protection period expired without dispute'
          );
          released += 1;
          totalReleased += sellerAmount;
        } catch (err) {
          // One bad row (e.g. ESCROW_INSUFFICIENT) shouldn't roll back every
          // other legitimate release in the same sweep — record and continue.
          errors.push({ orderId: row.id, error: err.message });
        }
      }

      return { released, totalReleased, checked: eligible.rows.length, errors };
    });

    return res.json({ message: `Auto-release complete: ${summary.released} order(s) released.`, ...summary });
  } catch (err) {
    console.error('Auto-release expired escrow error:', err);
    return res.status(500).json({ error: 'Could not run escrow auto-release.' });
  }
}



// A buyer/seller/delivery partner with a long order history previously got
// every single order back in one unbounded query — no LIMIT at all. Paginated
// here the same way allOrders() already does it for the admin view.
function parsePageParams(query, defaultSize = 20, maxSize = 100) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || defaultSize, 1), maxSize);
  const page = Math.max(Number(query.page) || 1, 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export async function myOrdersAsBuyer(req, res) {
  const { page, pageSize, offset } = parsePageParams(req.query);
  const [result, countResult] = await Promise.all([
    query(
      `SELECT o.*, s.name AS shop_name, s.slug AS shop_slug, s.is_verified AS shop_is_verified
       FROM orders o JOIN shops s ON s.id = o.shop_id
       WHERE o.buyer_id = $1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, pageSize, offset]
    ),
    query('SELECT COUNT(*) FROM orders WHERE buyer_id = $1', [req.user.id])
  ]);
  res.json({ orders: result.rows, total: Number(countResult.rows[0].count), page, pageSize });
}

export async function myOrdersAsSeller(req, res) {
  const { page, pageSize, offset } = parsePageParams(req.query);
  const shopResult = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
  if (shopResult.rows.length === 0) return res.json({ orders: [], total: 0, page, pageSize });
  const [result, countResult] = await Promise.all([
    query('SELECT * FROM orders WHERE shop_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [shopResult.rows[0].id, pageSize, offset]),
    query('SELECT COUNT(*) FROM orders WHERE shop_id = $1', [shopResult.rows[0].id])
  ]);
  res.json({ orders: result.rows, total: Number(countResult.rows[0].count), page, pageSize });
}

export async function myOrdersAsDelivery(req, res) {
  const { page, pageSize, offset } = parsePageParams(req.query);
  const [result, countResult] = await Promise.all([
    query('SELECT * FROM orders WHERE delivery_personnel_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [req.user.id, pageSize, offset]),
    query('SELECT COUNT(*) FROM orders WHERE delivery_personnel_id = $1', [req.user.id])
  ]);
  res.json({ orders: result.rows, total: Number(countResult.rows[0].count), page, pageSize });
}

export async function allOrders(req, res) {
  const { status, search, page = 1, pageSize = 50 } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`o.status = $${i}`); values.push(status); i += 1; }
  if (search) {
    conditions.push(`(o.id::text ILIKE $${i} OR b.full_name ILIKE $${i} OR b.email ILIKE $${i} OR s.name ILIKE $${i})`);
    values.push(`%${search}%`);
    i += 1;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(pageSize) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [result, countResult] = await Promise.all([
    query(
      `SELECT o.*, b.full_name AS buyer_name, b.email AS buyer_email, s.name AS shop_name
       FROM orders o
       JOIN users b ON b.id = o.buyer_id
       JOIN shops s ON s.id = o.shop_id
       ${where}
       ORDER BY o.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM orders o JOIN users b ON b.id = o.buyer_id JOIN shops s ON s.id = o.shop_id ${where}`, values),
  ]);

  res.json({ orders: result.rows, total: Number(countResult.rows[0].count), page: Number(page), pageSize: limit });
}

// Admin-initiated refund. Unlike cancelOrder (buyer-only, and only before
// funds are released), this lets an admin resolve a dispute or stuck order
// any time before payout — reverses escrow to the buyer, restocks the
// product, and notifies both sides. Orders whose funds were already
// released to the seller via releaseFunds() are not covered here and need
// a separate seller-side clawback, which this platform does not yet have.
const ADMIN_REFUNDABLE_STATUSES = ['paid_escrow', 'shipped', 'delivered_confirmed', 'disputed'];

export async function adminRefundOrder(req, res) {
  const { orderId } = req.params;
  const { reason } = req.body;
  try {
    const result = await withTransaction(async (client) => {
      // Same atomic-guard pattern as releaseFunds: the status flip to
      // 'cancelled' only succeeds once, for whichever request gets there
      // first, so a double-click or retried admin action can't refund the
      // same escrow hold to the buyer twice.
      const flipped = await client.query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = now(), cancellation_reason = $1
         WHERE id = $2 AND status = ANY($3::order_status[]) RETURNING *`,
        [reason ? `Refunded by admin: ${reason}` : 'Refunded by admin', orderId, ADMIN_REFUNDABLE_STATUSES]
      );
      if (flipped.rows.length === 0) {
        const existing = await client.query('SELECT id, status FROM orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        const err = new Error('NOT_REFUNDABLE'); err.code = 'NOT_REFUNDABLE'; err.status = existing.rows[0].status; throw err;
      }
      const order = flipped.rows[0];

      const escrowWallet = await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE type = 'escrow' AND balance >= $1 RETURNING *`,
        [order.total_amount]
      );
      if (escrowWallet.rows.length === 0) {
        const err = new Error('ESCROW_INSUFFICIENT'); err.code = 'ESCROW_INSUFFICIENT'; throw err;
      }
      await logWalletTransaction(client, {
        walletId: escrowWallet.rows[0].id, direction: 'debit', amount: order.total_amount, balanceAfter: escrowWallet.rows[0].balance,
        referenceType: 'order_refund', referenceId: order.id, note: reason || 'Refunded to buyer by admin', createdBy: req.user.id
      });

      const buyerWallet = await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2 AND type = 'user' RETURNING *`,
        [order.total_amount, order.buyer_id]
      );
      await logWalletTransaction(client, {
        walletId: buyerWallet.rows[0].id, direction: 'credit', amount: order.total_amount, balanceAfter: buyerWallet.rows[0].balance,
        referenceType: 'order_refund', referenceId: order.id, note: reason || 'Refunded to buyer by admin', createdBy: req.user.id
      });

      await client.query(`UPDATE products SET quantity_available = quantity_available + $1 WHERE id = $2`, [order.quantity, order.product_id]);
      await client.query(
        `INSERT INTO escrow_ledger (order_id, direction, amount, note, created_by) VALUES ($1,'out',$2,$3,$4)`,
        [orderId, order.total_amount, reason ? `Refunded to buyer by admin: ${reason}` : 'Refunded to buyer by admin', req.user.id]
      );

      const shopResult = await client.query('SELECT owner_id, name FROM shops WHERE id = $1', [order.shop_id]);
      const sellerId = shopResult.rows[0]?.owner_id;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'order_refunded','Order refunded',$2,$3)`,
        [order.buyer_id, `Your order has been refunded${reason ? `: ${reason}` : '.'}`, req.user.id]
      );
      if (sellerId) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'order_refunded','Order refunded',$2,$3)`,
          [sellerId, `An order for "${shopResult.rows[0].name}" was refunded to the buyer by admin${reason ? `: ${reason}` : '.'}`, req.user.id]
        );
      }

      await logSecurityEvent(client, {
        actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
        eventType: 'order_refunded_by_admin', entityType: 'order', entityId: order.id,
        metadata: { amount: order.total_amount, currency: order.currency, buyerId: order.buyer_id, reason: reason || null, ip: req.ip },
      });

      return true;
    });

    await safeGenerateDocument(() => createRefundReceipt(orderId, reason), 'refund_receipt:adminRefundOrder');

    return res.json({ message: 'Order refunded to buyer.' });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    if (err.code === 'NOT_REFUNDABLE') {
      return res.status(400).json({
        error: err.status === 'completed'
          ? 'Funds for this order were already released to the seller and cannot be refunded from here.'
          : `Orders in "${err.status}" status cannot be refunded.`
      });
    }
    if (err.code === 'ESCROW_INSUFFICIENT') return res.status(500).json({ error: 'Escrow balance inconsistency detected — refund blocked, contact engineering.' });
    console.error('Admin refund error:', err);
    return res.status(500).json({ error: 'Could not process refund.' });
  }
}

// Admin assigns a delivery person to an order.
export async function assignDelivery(req, res) {
  const { orderId } = req.params;
  const { deliveryPersonnelId } = req.body;
  const result = await query('UPDATE orders SET delivery_personnel_id = $1 WHERE id = $2 RETURNING *', [deliveryPersonnelId, orderId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
  await query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'new_order','New delivery assigned','You have been assigned to deliver an order.')`,
    [deliveryPersonnelId]
  );
  res.json({ message: 'Delivery personnel assigned.', order: result.rows[0] });
}
export async function checkoutCart(req, res) {
  const { method, shippingAddress } = req.body;
  const adapter = ADAPTERS[method];
  if (!adapter) return res.status(400).json({ error: 'Unsupported payment method.' });

  try {
    // A buyer that's already mid-checkout (an unpaid group created in the
    // last 2 minutes) gets that group handed back instead of a fresh one —
    // guards against a double-tapped "Checkout" button creating two sets of
    // orders (and, once paid, two escrow credits) for the same cart.
    const inFlight = await query(
      `SELECT checkout_group_id FROM orders
       WHERE buyer_id = $1 AND status = 'pending_payment' AND checkout_group_id IS NOT NULL
         AND created_at > now() - interval '2 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (inFlight.rows.length > 0) {
      const existingOrders = await query('SELECT * FROM orders WHERE checkout_group_id = $1', [inFlight.rows[0].checkout_group_id]);
      const existingPayment = await query('SELECT provider_reference FROM payments WHERE order_id = $1', [existingOrders.rows[0].id]);
      return res.status(200).json({
        message: 'A checkout for your cart is already in progress.',
        orders: existingOrders.rows,
        checkoutGroupId: inFlight.rows[0].checkout_group_id,
        combinedTotal: existingOrders.rows.reduce((sum, o) => sum + Number(o.total_amount), 0),
        providerReference: existingPayment.rows[0]?.provider_reference
      });
    }

    const settings = await query('SELECT * FROM platform_settings WHERE id = 1');
    const feePercent = Number(settings.rows[0].platform_fee_percent);
    const checkoutGroupId = crypto.randomUUID();

    // Order rows are created inside one transaction, and the stock check
    // uses SELECT ... FOR UPDATE to lock each product row for the duration
    // of the checkout — so two buyers racing to check out the last unit of
    // the same product can't both pass the "enough stock" check at once.
    const { createdOrders, combinedTotal, currency } = await withTransaction(async (client) => {
      const cartResult = await client.query(
        `SELECT ci.id AS cart_item_id, ci.quantity, p.id AS product_id, p.price, p.currency, p.quantity_available,
                p.minimum_order_quantity, s.id AS shop_id, u.primary_role AS shop_owner_role
         FROM cart_items ci JOIN products p ON p.id = ci.product_id JOIN shops s ON s.id = p.shop_id
         JOIN users u ON u.id = s.owner_id
         WHERE ci.user_id = $1 AND p.status = 'active'
         FOR UPDATE OF p`,
        [req.user.id]
      );
      if (cartResult.rows.length === 0) {
        const err = new Error('EMPTY_CART'); err.code = 'EMPTY_CART'; throw err;
      }
      for (const item of cartResult.rows) {
        if (item.quantity > item.quantity_available) {
          const err = new Error('OUT_OF_STOCK'); err.code = 'OUT_OF_STOCK'; throw err;
        }
        if (['manufacturer', 'supplier', 'farmer'].includes(item.shop_owner_role) && item.quantity < item.minimum_order_quantity) {
          const err = new Error('MOQ_NOT_MET'); err.code = 'MOQ_NOT_MET'; err.moq = item.minimum_order_quantity; throw err;
        }
      }

      let total = 0;
      const orders = [];
      for (const item of cartResult.rows) {
        const subtotal = Number(item.price) * item.quantity;
        const feeAmount = Math.round(subtotal * feePercent) / 100;
        const orderTotal = subtotal + feeAmount;
        total += orderTotal;

        const orderResult = await client.query(
          `INSERT INTO orders (buyer_id, shop_id, product_id, quantity, unit_price, currency, platform_fee_percent, platform_fee_amount, total_amount, shipping_address, checkout_group_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [req.user.id, item.shop_id, item.product_id, item.quantity, item.price, item.currency, feePercent, feeAmount, orderTotal, shippingAddress || null, checkoutGroupId]
        );
        orders.push(orderResult.rows[0]);
      }
      return { createdOrders: orders, combinedTotal: total, currency: cartResult.rows[0].currency };
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const charge = await adapter({
      amount: combinedTotal, currency, orderId: `cart-${checkoutGroupId}`,
      returnUrl: `${frontendUrl}/orders?checkoutGroup=${checkoutGroupId}`
    });

    for (const order of createdOrders) {
      await query(
        `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
         VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
        [order.id, method, order.total_amount, currency, charge.providerReference, charge.raw]
      );
      await safeGenerateDocument(() => createOrderConfirmation(order.id), 'order_confirmation:checkoutCart');
    }

    return res.status(201).json({
      message: `Created ${createdOrders.length} order(s) from your cart. Complete payment to move funds into escrow.`,
      orders: createdOrders, checkoutGroupId,
      combinedTotal, checkoutUrl: charge.checkoutUrl, providerReference: charge.providerReference
    });
  } catch (err) {
    if (err.code === 'EMPTY_CART') return res.status(400).json({ error: 'Your cart is empty.' });
    if (err.code === 'MOQ_NOT_MET') return res.status(400).json({ error: `One of your cart items is bulk-only with a minimum order of ${err.moq} units. Adjust the quantity or request a quote instead.`, minimumOrderQuantity: err.moq });
    if (err.code === 'OUT_OF_STOCK') return res.status(400).json({ error: 'Not enough stock for one of your cart items.' });
    console.error('Cart checkout error:', err);
    return res.status(500).json({ error: 'Could not check out your cart.' });
  }
}

// Confirms payment for every order in a checkout group at once, and clears
// the cart of the items that were just purchased.
export async function confirmCartPayment(req, res) {
  const { checkoutGroupId } = req.params;

  try {
    const orders = await query(`SELECT id FROM orders WHERE checkout_group_id = $1 AND buyer_id = $2`, [checkoutGroupId, req.user.id]);
    if (orders.rows.length === 0) return res.status(404).json({ error: 'Checkout group not found.' });

    // Same sandbox-only restriction as confirmPayment() above: this is a
    // manual dev-flow endpoint, not a real payment confirmation. Any
    // order in the group that was charged through a real (non-sandbox)
    // provider key can only be confirmed by that provider's
    // signature-verified webhook.
    const orderIds = orders.rows.map((o) => o.id);
    const paymentRefs = await query(
      `SELECT order_id, provider_reference FROM payments WHERE order_id = ANY($1::uuid[])`,
      [orderIds]
    );
    const hasLiveReference = paymentRefs.rows.some((p) => !/-SANDBOX-/.test(p.provider_reference || ''));
    if (hasLiveReference) {
      return res.status(403).json({
        error: 'One or more orders in this checkout were charged through a live payment provider. Payment confirmation must come from the provider, not this endpoint.'
      });
    }

    // Each order in the group is confirmed in its own guarded transaction —
    // same pattern as the single-item confirmPayment(): the status flip out
    // of pending_payment only succeeds once per order, so a retried webhook,
    // a double-tapped "I've paid" button, or two concurrent requests for the
    // same checkout group can never credit escrow twice for the same order.
    let confirmedCount = 0;
    for (const { id: orderId } of orders.rows) {
      const confirmed = await withTransaction(async (client) => {
        const settingsResult = await client.query('SELECT escrow_protection_days FROM platform_settings WHERE id = 1');
        const protectionDays = settingsResult.rows[0]?.escrow_protection_days ?? 7;

        const flipped = await client.query(
          `UPDATE orders SET status = 'paid_escrow', protection_period_ends_at = now() + ($2 || ' days')::interval
           WHERE id = $1 AND status = 'pending_payment' RETURNING *`,
          [orderId, protectionDays]
        );
        if (flipped.rows.length === 0) return null; // already confirmed or in a later state — skip, not an error
        const order = flipped.rows[0];

        await client.query(`UPDATE payments SET status = 'succeeded' WHERE order_id = $1`, [orderId]);

        const escrowWallet = await client.query(
          `UPDATE wallets SET balance = balance + $1 WHERE type = 'escrow' RETURNING *`,
          [order.total_amount]
        );
        await logWalletTransaction(client, {
          walletId: escrowWallet.rows[0].id, direction: 'credit', amount: order.total_amount, balanceAfter: escrowWallet.rows[0].balance,
          referenceType: 'order_escrow', referenceId: order.id, note: 'Cart checkout — buyer payment held in escrow', createdBy: req.user.id
        });
        await client.query(
          `INSERT INTO escrow_ledger (order_id, direction, amount, note, created_by) VALUES ($1,'in',$2,'Cart checkout — buyer payment held in escrow',$3)`,
          [order.id, order.total_amount, req.user.id]
        );
        await client.query(
          `UPDATE products SET quantity_available = quantity_available - $1, orders_count = orders_count + 1 WHERE id = $2`,
          [order.quantity, order.product_id]
        );
        await client.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user.id, order.product_id]);

        const shop = await client.query('SELECT owner_id FROM shops WHERE id = $1', [order.shop_id]);
        if (shop.rows[0]) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'new_order','New order received','You have a new paid order waiting to be fulfilled.')`,
            [shop.rows[0].owner_id]
          );
        }
        return order;
      });
      if (confirmed) {
        confirmedCount += 1;
        const paymentRow = await query('SELECT method FROM payments WHERE order_id = $1 LIMIT 1', [orderId]);
        await safeGenerateDocument(
          () => createDigitalReceipt(orderId, { paymentMethod: paymentRow.rows[0]?.method || null }),
          'digital_receipt:confirmCartPayment'
        );
        await safeGenerateDocument(
          () => createPaymentConfirmation(orderId, {
            direction: 'escrow_hold', amount: confirmed.total_amount, recipientId: confirmed.buyer_id,
            note: 'Buyer payment received and held in Jedida escrow.'
          }),
          'payment_confirmation:confirmCartPayment'
        );
      }
    }

    return res.json({
      message: confirmedCount > 0
        ? 'Payment confirmed for all items. Funds are held in escrow until delivery is confirmed.'
        : 'These orders were already confirmed — no changes made.',
      confirmedCount
    });
  } catch (err) {
    console.error('Confirm cart payment error:', err);
    return res.status(500).json({ error: 'Could not confirm payment.' });
  }
}
const CANCELLABLE_STATUSES = ['pending_payment', 'paid_escrow'];

export async function cancelOrder(req, res) {
  const { reason } = req.body;
  const { orderId } = req.params;

  try {
    const result = await withTransaction(async (client) => {
      // Atomic guarded transition, same pattern as adminRefundOrder(): the
      // flip to 'cancelled' only succeeds once, from an allowed status, for
      // whichever request gets there first — so a double-tap of "cancel" or
      // two concurrent requests for the same order can't both pass the
      // pre-check and both refund escrow (a double-refund would create
      // money that was never actually paid in).
      const flipped = await client.query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = now(), cancellation_reason = $1
         WHERE id = $2 AND buyer_id = $3 AND status = ANY($4::order_status[]) RETURNING *`,
        [reason || null, orderId, req.user.id, CANCELLABLE_STATUSES]
      );
      if (flipped.rows.length === 0) {
        const existing = await client.query('SELECT id, status FROM orders WHERE id = $1 AND buyer_id = $2', [orderId, req.user.id]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        const err = new Error('NOT_CANCELLABLE'); err.code = 'NOT_CANCELLABLE'; throw err;
      }
      const order = flipped.rows[0];

      if (order.status === 'paid_escrow') {
        // The balance >= amount check here is the same defense-in-depth
        // used everywhere else money leaves escrow: it can never go
        // negative even if some other bug already drained it.
        const escrowWallet = await client.query(
          `UPDATE wallets SET balance = balance - $1 WHERE type = 'escrow' AND balance >= $1 RETURNING *`,
          [order.total_amount]
        );
        if (escrowWallet.rows.length === 0) {
          const err = new Error('ESCROW_INSUFFICIENT'); err.code = 'ESCROW_INSUFFICIENT'; throw err;
        }
        await logWalletTransaction(client, {
          walletId: escrowWallet.rows[0].id, direction: 'debit', amount: order.total_amount, balanceAfter: escrowWallet.rows[0].balance,
          referenceType: 'order_refund', referenceId: order.id, note: 'Order cancelled by buyer', createdBy: req.user.id
        });

        const buyerWallet = await client.query(
          `UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2 AND type = 'user' RETURNING *`,
          [order.total_amount, req.user.id]
        );
        await logWalletTransaction(client, {
          walletId: buyerWallet.rows[0].id, direction: 'credit', amount: order.total_amount, balanceAfter: buyerWallet.rows[0].balance,
          referenceType: 'order_refund', referenceId: order.id, note: 'Order cancelled — refunded to wallet', createdBy: req.user.id
        });

        await client.query(
          `INSERT INTO escrow_ledger (order_id, direction, amount, note, created_by) VALUES ($1,'out',$2,'Order cancelled by buyer — refunded',$3)`,
          [order.id, order.total_amount, req.user.id]
        );
        await client.query(`UPDATE products SET quantity_available = quantity_available + $1 WHERE id = $2`, [order.quantity, order.product_id]);
      }

      return order;
    });

    return res.json({ message: 'Order cancelled.', order: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    if (err.code === 'NOT_CANCELLABLE') return res.status(400).json({ error: 'This order can no longer be cancelled.' });
    if (err.code === 'ESCROW_INSUFFICIENT') return res.status(500).json({ error: 'Escrow balance inconsistency detected — cancellation blocked, contact engineering.' });
    console.error('Cancel order error:', err);
    return res.status(500).json({ error: 'Could not cancel order.' });
  }
}

export async function reorder(req, res) {
  const original = await query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [req.params.orderId, req.user.id]);
  if (original.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

  const product = await query('SELECT quantity_available, status FROM products WHERE id = $1', [original.rows[0].product_id]);
  if (!product.rows[0] || product.rows[0].status !== 'active') {
    return res.status(400).json({ error: 'This product is no longer available.' });
  }

  res.json({
    message: 'Ready to reorder — proceed to checkout.',
    productId: original.rows[0].product_id,
    quantity: original.rows[0].quantity
  });
}

export async function getReceipt(req, res) {
  const order = await query(
    `SELECT o.*, p.title AS product_title, s.name AS shop_name FROM orders o
     JOIN products p ON p.id = o.product_id JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1 AND o.buyer_id = $2`,
    [req.params.orderId, req.user.id]
  );
  if (order.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

  res.json({
    receipt: {
      orderId: order.rows[0].id,
      date: order.rows[0].created_at,
      product: order.rows[0].product_title,
      shop: order.rows[0].shop_name,
      quantity: order.rows[0].quantity,
      unitPrice: order.rows[0].unit_price,
      platformFee: order.rows[0].platform_fee_amount,
      total: order.rows[0].total_amount,
      currency: order.rows[0].currency,
      status: order.rows[0].status
    }
  });
}

// Contact seller about a specific order — routes through the existing
// Buyer -> Admin bridge system, tagging the message with the order for context.
export async function contactSellerAboutOrder(req, res) {
  const order = await query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [req.params.orderId, req.user.id]);
  if (order.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

  const { getOrCreateConversation, saveMessage } = await import('../chat/chatService.js');
  const convo = await getOrCreateConversation({ userId: req.user.id, orderId: order.rows[0].id });
  await saveMessage({
    conversationId: convo.id, userId: req.user.id, senderId: req.user.id,
    body: `Regarding order ${order.rows[0].id.slice(0, 8)}: ${req.body.message || 'I have a question about this order.'}`
  });

  res.json({ message: 'Message sent to the admin team, who will relay it to the seller.', conversationId: convo.id });
}
export async function submitManualPayment(req, res) {

  const { checkoutGroupId } = req.params;

  const {
    phoneNumber,
    transactionReference,
    proofImage
  } = req.body;

  if (!transactionReference || !proofImage) {
    return res.status(400).json({ error: 'A transaction reference and proof image are required.' });
  }

  try {

    // Scoped to o.buyer_id = req.user.id (not just the checkout group id)
    // so one buyer can't submit — or overwrite — payment proof on an order
    // that belongs to someone else. Restricted to payments still in
    // 'initiated' so a payment that's already been submitted, approved, or
    // rejected can't be silently rewritten by a resubmission.
    const result = await query(
      `
      UPDATE payments p
      SET
      status='submitted',
      payer_phone=$1,
      transaction_reference=$2,
      proof_image=$3

      FROM orders o

      WHERE
      p.order_id=o.id
      AND o.checkout_group_id=$4
      AND o.buyer_id=$5
      AND p.status='initiated'

      RETURNING p.*
      `,
      [
        phoneNumber || null,
        transactionReference,
        proofImage,
        checkoutGroupId,
        req.user.id
      ]
    );


    if(result.rows.length===0){

      return res.status(404)
      .json({
        error:"No pending payment found for this checkout group, or it has already been submitted."
      });

    }


    res.json({
      message:
      "Payment submitted for admin verification",

      payments:result.rows
    });


  }catch(err){

    console.error(err);

    res.status(500)
    .json({
      error:"Could not submit payment"
    });

  }

}
