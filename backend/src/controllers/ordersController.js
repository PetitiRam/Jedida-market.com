import { query, withTransaction } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';
import { ADAPTERS, verifyPesajetPayment } from '../services/paymentProviders.js';
import { payForOrder } from './walletsController.js';
import { postTransaction, setOrderFinancialState, setOrderReleaseState } from '../services/ledgerService.js';
import crypto from 'crypto';
import { cached, cacheDel } from '../utils/cache.js';
import { creditSaleCommission, alertHeldSaleCommission } from '../services/affiliateService.js';
import { createOrderConfirmation, createDigitalReceipt, createDeliveryReceipt, createRefundReceipt, createPaymentConfirmation } from '../services/documentService.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUploadAny } from '../services/uploadSecurity.js';
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

export async function logWalletTransaction(client, { walletId, direction, amount, balanceAfter, referenceType, referenceId, note, createdBy }) {
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

// Cash on Delivery never goes through a payment adapter — there is no
// charge to create. isCashOnDelivery() + insertCodPayment() are shared by
// createOrder() and checkoutCart() below so both entry points treat COD
// identically: order created as normal, payment row inserted as 'pending'
// (never 'succeeded'), and the escrow-crediting path is never touched.
// COD only becomes 'succeeded' later, when a driver records the cash
// handoff — see deliveryController.js's collectCash().
function isCashOnDelivery(method) {
  return method === 'cash_on_delivery';
}

// Wallet payment never touches an external adapter — the "charge" is an
// internal, atomic wallet debit (walletsController.payForOrder), and the
// "confirmation" is calling applyPaymentConfirmation() directly and
// synchronously right after, instead of waiting on a provider webhook.
// See BUYER_WALLET.txt's Pay section: validate balance -> reserve/debit
// funds -> create financial transaction -> connect to order -> apply
// escrow rules -> commit transaction.
function isWalletPayment(method) {
  return method === 'wallet';
}

// Accepts either the pool-level `query` or a transaction's `client.query`
// — both share the same (sql, params) => Promise signature.
async function insertCodPayment(queryFn, { orderId, amount, currency }) {
  await queryFn(
    `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
     VALUES ($1,'cash_on_delivery',$2,$3,'pending',NULL,$4)`,
    [orderId, amount, currency, { note: 'Cash on Delivery — collected at delivery, not prepaid.' }]
  );
}

// Server-side mirror of the frontend's AVAILABILITY_KEY / PROVIDER_CODE maps
// (PaymentMethodSelector.jsx). Kept here rather than imported from the
// frontend because this is the actual enforcement point — the frontend map
// only decides what a button looks like; hiding a button is not
// authorization (spec section 32/24). Every raw payment_method value the
// order endpoints accept must resolve to both a settings flag (Level 1) and
// a provider_registry code (Level 3), or it can't be charged at all.
const METHOD_SETTINGS_FLAG = {
  pesajet: 'enablePesajet',
  cash_on_delivery: 'enableCash',
  mtn_mobile_money: 'enableMobileMoney',
  airtel_money: 'enableMobileMoney',
  stripe: 'enableCardPayments',
  dpo: 'enableCardPayments',
  // 'wallet' is deliberately absent here, same as flutterwave/coinbase
  // below it in METHOD_PROVIDER_CODE — it isn't a third-party provider a
  // shop connects on their Payments page, it's the platform's own
  // internal balance, so there's no settings flag or provider_registry
  // row to gate it against. assertPaymentMethodAllowed()'s existing
  // "methods with no registry mapping yet aren't gated by this layer"
  // fallback already covers it correctly without any change there.
};
const METHOD_PROVIDER_CODE = {
  pesajet: 'pesajet',
  cash_on_delivery: 'cash_on_delivery',
  mtn_mobile_money: 'mobile_money',
  airtel_money: 'mobile_money',
  stripe: 'card_payments',
  dpo: 'card_payments',
};

// Enforces the remaining feature-control levels for a payment method server
// side (Level 1: re-checked here too so this helper is a complete gate on
// its own, not just relying on each caller remembering to check settings
// first; Level 3: every shop in this order/cart actually connected the
// method on their Payments page — schema_phase83_provider_registry.sql).
// shopIds is an array since a cart checkout can span multiple shops; the
// method must be connected by every one of them.
async function assertPaymentMethodAllowed(method, shopIds, paymentSettings) {
  const flagKey = METHOD_SETTINGS_FLAG[method];
  if (flagKey && !paymentSettings?.[flagKey]) {
    return { ok: false, error: 'This payment method is not currently enabled.' };
  }
  const providerCode = METHOD_PROVIDER_CODE[method];
  if (!providerCode) return { ok: true }; // methods with no registry mapping yet (flutterwave/coinbase) aren't gated by this layer
  const ids = [...new Set(shopIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };
  const result = await query(
    `SELECT COUNT(DISTINCT spc.shop_id) AS connected_count
     FROM seller_provider_connections spc JOIN provider_registry pr ON pr.id = spc.provider_id
     WHERE spc.shop_id = ANY($1::uuid[]) AND spc.status = 'connected' AND pr.code = $2 AND pr.category = 'payment' AND pr.status = 'active'`,
    [ids, providerCode]
  );
  if (Number(result.rows[0].connected_count) < ids.length) {
    return { ok: false, error: 'This payment method is not available for one of the shops in your order.' };
  }
  return { ok: true };
}


// Admin-only. Calls PesaJet's real GET /payments/:id and surfaces the raw
// status into the SAME admin payment-review queue that manual mtn/airtel
// proof submissions already go through (getPendingPayments/approvePayment
// in adminPaymentsController.js) — nothing here decides "this succeeded"
// on its own. We still don't have PesaJet's documented terminal status
// strings, so instead of guessing, this stores PesaJet's raw status text
// into the existing transaction_reference column (already rendered in
// AdminPayments.jsx) and flips the payment to 'submitted' so a human admin
// reads PesaJet's own words and clicks the existing Approve/Reject button.
export async function checkPesajetStatus(req, res) {
  const { orderId } = req.params;
  try {
    const paymentResult = await query(
      `SELECT * FROM payments WHERE order_id = $1 AND method = 'pesajet' LIMIT 1`,
      [orderId]
    );
    const payment = paymentResult.rows[0];
    if (!payment) return res.status(404).json({ error: 'No PesaJet payment found for this order.' });
    if (!payment.provider_reference) return res.status(400).json({ error: 'This payment has no PesaJet transaction id on file.' });
    if (payment.status !== 'initiated' && payment.status !== 'submitted') {
      return res.status(409).json({ error: `Payment is already '${payment.status}' — nothing to check.` });
    }

    const pesajetData = await verifyPesajetPayment(payment.provider_reference);

    await query(
      `UPDATE payments SET status = 'submitted', transaction_reference = $1, raw_response = $2 WHERE id = $3`,
      [pesajetData.status || 'UNKNOWN', pesajetData, payment.id]
    );

    return res.json({
      message: 'PesaJet status fetched — review it in the admin payments queue and approve/reject manually.',
      pesajetStatus: pesajetData.status,
      failureReason: pesajetData.failureReason || null,
      raw: pesajetData
    });
  } catch (err) {
    console.error('PesaJet status check error:', err);
    return res.status(502).json({ error: err.message || 'Could not check PesaJet status.' });
  }
}

// Buyer initiates checkout for a product -> creates an order in pending_payment.
export async function createOrder(req, res) {
  const { productId, quantity = 1, shippingAddress, method, couponCode, phoneNumber, network } = req.body;
  if (!productId || !method) return res.status(400).json({ error: 'Product and payment method are required.' });

  try {
    const cod = isCashOnDelivery(method);
    const walletPay = isWalletPayment(method);
    const settings = await getSettings();
    // Cheap upfront shop_id lookup so the payment-method gate can run
    // before any charge or DB write, for COD as well as real methods
    // (the non-COD preview query below already needs this same row, so
    // this doesn't add a second query on that path — it just moves the
    // existing one earlier).
    const shopLookup = await query(
      `SELECT s.id AS shop_id FROM products p JOIN shops s ON s.id = p.shop_id WHERE p.id = $1 AND p.status = 'active'`,
      [productId]
    );
    if (!shopLookup.rows[0]) return res.status(404).json({ error: 'Product not available.' });
    const methodCheck = await assertPaymentMethodAllowed(method, [shopLookup.rows[0].shop_id], settings.payment_settings);
    if (!methodCheck.ok) return res.status(400).json({ error: methodCheck.error });

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
    if (!cod && !walletPay && !adapter) return res.status(400).json({ error: 'Unsupported payment method.' });

    // For any real payment method (never for COD, which has no such step,
    // and never for wallet, whose "charge" is an internal atomic debit
    // that happens after the order exists — see the walletPay branch
    // below applyPaymentConfirmation), the order must not be written to
    // the database unless the payer has actually been prompted to pay —
    // i.e. the provider accepted the charge
    // request (for PesaJet: the customer gets the PIN prompt). So the
    // charge happens FIRST, against a lightweight read-only preview of the
    // price (product + coupon validated but not yet locked/redeemed — that
    // still only happens once, inside the transaction below, so a coupon
    // is never consumed for a charge that fails). Only if that charge
    // succeeds does the real order-creation transaction run.
    let candidateOrderId = null;
    let charge = null;
    if (!cod && !walletPay) {
      // Wanted-bridge products (products.wanted_quote_id — see phase87) stay
      // 'draft' so they never surface in browse/home/search, but they ARE
      // orderable: they only exist because a buyer already accepted a
      // locked, server-computed quote through Jedida Wanted. Nothing else
      // with status='draft' qualifies.
      const preview = await query(
        `SELECT p.price, p.currency, p.quantity_available, p.minimum_order_quantity, s.id AS shop_id, u.primary_role AS shop_owner_role
         FROM products p JOIN shops s ON s.id = p.shop_id JOIN users u ON u.id = s.owner_id
         WHERE p.id = $1 AND (p.status = 'active' OR p.wanted_quote_id IS NOT NULL)`,
        [productId]
      );
      const previewProduct = preview.rows[0];
      if (!previewProduct) return res.status(404).json({ error: 'Product not available.' });
      if (previewProduct.quantity_available < quantity) return res.status(400).json({ error: 'Not enough stock available.' });
      if (['manufacturer', 'supplier', 'farmer'].includes(previewProduct.shop_owner_role) && quantity < previewProduct.minimum_order_quantity) {
        return res.status(400).json({
          error: `This is a bulk-only listing — minimum order is ${previewProduct.minimum_order_quantity} units. Request a quote instead if you need a smaller amount.`,
          minimumOrderQuantity: previewProduct.minimum_order_quantity
        });
      }

      const settings = await getSettings();
      const feePercent = Number(settings.platform_fee_percent);
      const subtotal = Number(previewProduct.price) * quantity;

      let discount = 0;
      if (couponCode) {
        const couponResult = await query(
          `SELECT * FROM coupons WHERE code = $1 AND (shop_id = $2 OR shop_id IS NULL) AND is_active = TRUE
             AND (expires_at IS NULL OR expires_at > now())`,
          [couponCode.toUpperCase(), previewProduct.shop_id]
        );
        const previewCoupon = couponResult.rows[0];
        if (!previewCoupon) return res.status(404).json({ error: 'Invalid or expired coupon code.' });
        if (subtotal < Number(previewCoupon.min_order_amount)) {
          return res.status(400).json({ error: `This coupon requires a minimum order of ${previewCoupon.min_order_amount}.` });
        }
        if (previewCoupon.max_uses != null && previewCoupon.uses_count >= previewCoupon.max_uses) {
          return res.status(409).json({ error: 'This coupon has just reached its usage limit.' });
        }
        discount = previewCoupon.discount_type === 'percent'
          ? Math.round(subtotal * (Number(previewCoupon.discount_value) / 100) * 100) / 100
          : Math.min(Number(previewCoupon.discount_value), subtotal);
      }

      const discountedSubtotal = subtotal - discount;
      const feeAmount = Math.round(discountedSubtotal * feePercent) / 100;
      const previewTotal = discountedSubtotal + feeAmount;

      candidateOrderId = crypto.randomUUID();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      try {
        charge = await adapter({
          amount: previewTotal, currency: previewProduct.currency, orderId: candidateOrderId,
          returnUrl: `${frontendUrl}/orders/${candidateOrderId}`,
          phoneNumber, network
        });
      } catch (chargeErr) {
        console.error('Payment charge failed before order creation:', chargeErr.message);
        return res.status(502).json({ error: chargeErr.message || 'Could not start payment. Your order was not created.' });
      }
    }

    let order;
    try {
      order = await withTransaction(async (client) => {
        // Row lock held for the stock check + order insert so two concurrent
        // purchases of the last unit of the same product can't both pass.
        // See the wanted-bridge note above the preview query — same
        // narrow allowance applies here.
        const productResult = await client.query(
          `SELECT p.*, s.id AS shop_id, u.primary_role AS shop_owner_role
           FROM products p JOIN shops s ON s.id = p.shop_id JOIN users u ON u.id = s.owner_id
           WHERE p.id = $1 AND (p.status = 'active' OR p.wanted_quote_id IS NOT NULL) FOR UPDATE OF p`,
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
          candidateOrderId
            ? `INSERT INTO orders (id, buyer_id, shop_id, product_id, quantity, unit_price, currency, platform_fee_percent, platform_fee_amount, total_amount, shipping_address, coupon_id, coupon_code, discount_amount)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`
            : `INSERT INTO orders (buyer_id, shop_id, product_id, quantity, unit_price, currency, platform_fee_percent, platform_fee_amount, total_amount, shipping_address, coupon_id, coupon_code, discount_amount)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          candidateOrderId
            ? [candidateOrderId, req.user.id, product.shop_id, product.id, quantity, unitPrice, product.currency, feePercent, feeAmount, total, shippingAddress || null, coupon?.id || null, coupon?.code || null, discount]
            : [req.user.id, product.shop_id, product.id, quantity, unitPrice, product.currency, feePercent, feeAmount, total, shippingAddress || null, coupon?.id || null, coupon?.code || null, discount]
        );
        const newOrder = orderResult.rows[0];

        // Payment row inserted in the SAME transaction as the order, so the
        // two can never exist independently of each other.
        if (cod) {
          await insertCodPayment(client.query.bind(client), { orderId: newOrder.id, amount: newOrder.total_amount, currency: newOrder.currency });
        } else if (walletPay) {
          // 'initiated' here too, same as the external-provider branch —
          // the debit + escrow confirmation happens right after this
          // transaction commits (see below), which is what flips this to
          // 'succeeded'. Kept as two steps rather than one so a failed
          // debit leaves a normal, already-understood 'pending_payment'
          // order behind instead of a half-written one.
          await client.query(
            `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
             VALUES ($1,'wallet',$2,$3,'initiated',NULL,$4)`,
            [newOrder.id, newOrder.total_amount, newOrder.currency, { note: 'Jedida Wallet payment' }]
          );
        } else {
          await client.query(
            `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
             VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
            [newOrder.id, method, newOrder.total_amount, newOrder.currency, charge.providerReference, charge.raw]
          );
        }

        return newOrder;
      });
    } catch (txErr) {
      // A charge already went through above (candidateOrderId/charge are
      // set) but the order itself failed to save — e.g. someone else took
      // the last unit, or the coupon was exhausted, in the moment between
      // the pre-charge preview and this locked transaction. We can't
      // safely auto-refund without a documented PesaJet refund endpoint,
      // so this surfaces clearly instead of silently losing the charge.
      if (charge) {
        console.error(`Order creation failed AFTER a successful charge (reference ${charge.providerReference}):`, txErr.message);
        return res.status(409).json({
          error: `Your payment was initiated (reference ${charge.providerReference}) but we could not finalize the order — ${
            txErr.code === 'OUT_OF_STOCK' ? 'the item just sold out.' :
            txErr.code === 'MOQ_NOT_MET' ? 'the quantity no longer meets the minimum order requirement.' :
            txErr.code === 'COUPON_INVALID' ? 'the coupon is no longer valid.' :
            txErr.code === 'COUPON_EXHAUSTED' ? 'the coupon just reached its usage limit.' :
            'please contact support.'
          } Please contact support with this reference number — do not attempt to pay again until this is resolved.`,
          providerReference: charge.providerReference
        });
      }
      throw txErr;
    }

    // Order exists now, in 'pending_payment' with a 'wallet' payment row
    // in 'initiated' — mirrors exactly where a real order sits right
    // after an external charge succeeds but before its webhook arrives.
    // The difference is there's no webhook to wait for: the debit is
    // internal, so it happens here, synchronously, and on success
    // reuses the SAME applyPaymentConfirmation() every other payment
    // method's webhook calls — same escrow credit, ledger entry, stock
    // decrement, and seller notification, not a parallel copy of them.
    if (walletPay) {
      try {
        await payForOrder(req.user.id, order.id, order.total_amount, order.currency);
      } catch (debitErr) {
        if (debitErr.code === 'INSUFFICIENT_FUNDS') {
          return res.status(400).json({
            error: 'Insufficient wallet balance for this order. Your order was created and is waiting for payment — choose another payment method to complete it.',
            order
          });
        }
        console.error('Wallet debit failed after order creation:', debitErr);
        return res.status(500).json({ error: 'Could not charge your wallet. Your order was created but is not yet paid — please try again.', order });
      }
      try {
        order = await applyPaymentConfirmation(order.id, { userId: req.user.id, confirmedVia: 'wallet' });
      } catch (confirmErr) {
        // The wallet was already debited above but escrow confirmation
        // failed — same "money moved, order not finalized" situation the
        // comment above this catch block already documents for external
        // charges, just with a wallet reference instead of a provider one.
        console.error(`Wallet debited for order ${order.id} but confirmation failed:`, confirmErr.message);
        return res.status(500).json({
          error: 'Your wallet was charged but we could not finalize the order. Please contact support — do not pay again.',
          order
        });
      }
    }

    await safeGenerateDocument(() => createOrderConfirmation(order.id), 'order_confirmation:createOrder');

    return res.status(201).json({
      message: cod
        ? 'Order created. Pay the delivery agent in cash when your order arrives.'
        : walletPay
          ? 'Order paid from your Jedida Wallet and moved into escrow.'
          : 'Order created. Complete payment to move funds into escrow.',
      order, codPending: cod, checkoutUrl: charge?.checkoutUrl, providerReference: charge?.providerReference
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

    // Unified ledger record (phase 94): the same event that just moved
    // wallet balances/escrow_ledger above is also recorded here in the
    // omnichannel shape, so this order shows up in the same transaction
    // feed a future POS sale or wallet deposit would. Keyed on order_id
    // so a retried webhook (already blocked above by the pending_payment
    // status-flip) can never double-post even if this were ever called
    // twice for one order. Covers every caller of applyPaymentConfirmation
    // — including this session's wallet-pay branch in createOrder() below
    // — since they all flow through this one shared function.
    const paymentRowForLedger = await client.query('SELECT method, provider_reference FROM payments WHERE order_id = $1 LIMIT 1', [orderId]);
    await postTransaction(client, {
      idempotencyKey: `order_payment:${order.id}`,
      transactionType: 'order_payment',
      status: 'succeeded',
      source: 'marketplace',
      amount: order.total_amount,
      feeAmount: order.platform_fee_amount || 0,
      currency: order.currency,
      orderId: order.id,
      orderPublicRef: order.public_ref,
      buyerId: order.buyer_id,
      sellerId: shopResult.rows[0]?.owner_id || null,
      shopId: order.shop_id,
      actorId: userId || order.buyer_id,
      destinationWalletId: escrowWallet.rows[0].id,
      paymentMethod: paymentRowForLedger.rows[0]?.method || null,
      providerReference: paymentRowForLedger.rows[0]?.provider_reference || null,
      metadata: { confirmedVia: confirmedVia || 'unknown' },
      createdBy: userId || order.buyer_id,
    });
    // Funds now sit under JEDIDA financial control, not yet releasable —
    // release eligibility is decided by the fulfillment/release-rules
    // engine (a later phase), not by this payment-confirmation step.
    await setOrderFinancialState(client, { orderId: order.id, financialState: 'funds_controlled' });
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
      // Financial release_state now reflects that this order satisfies
      // JEDIDA's completion condition (spec #17) — releasable, not yet
      // released. releaseFunds()/autoReleaseExpiredEscrow() are still the
      // only things that actually move money; this just makes the order
      // visible in the Financial Control Center's "Releasable" tile
      // before an admin/settlement officer acts on it.
      await query(`UPDATE orders SET release_state = 'eligible', financial_state = 'releasable' WHERE id = $1`, [orderId]);
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

  // Unified ledger record (phase 94) — mirrors the wallet moves above in
  // the omnichannel shape, keyed on the order so this can never
  // double-post even if payOutClaimedOrder were ever reached twice for
  // one order (both callers already guard that with the funds_released_at
  // atomic claim above, but idempotency_key makes it true at the DB layer
  // too, not just by caller discipline).
  await postTransaction(client, {
    idempotencyKey: `release:${order.id}`,
    transactionType: 'release',
    status: 'succeeded',
    source: 'marketplace',
    amount: sellerAmount,
    feeAmount: order.platform_fee_amount || 0,
    netAmount: sellerAmount,
    currency: order.currency,
    orderId: order.id,
    orderPublicRef: order.public_ref,
    sellerId: order.seller_id,
    shopId: order.shop_id,
    actorId: releasedBy,
    sourceWalletId: escrowWallet.rows[0].id,
    destinationWalletId: sellerWallet.rows[0].id,
    metadata: { note: releaseNote },
    createdBy: releasedBy,
  });
  await setOrderFinancialState(client, { orderId: order.id, financialState: 'released' });
  await setOrderReleaseState(client, { orderId: order.id, releaseState: 'released' });

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
  const { method, shippingAddress, phoneNumber, network } = req.body;
  const cod = isCashOnDelivery(method);
  const walletPay = isWalletPayment(method);
  const adapter = ADAPTERS[method];
  if (!cod && !walletPay && !adapter) return res.status(400).json({ error: 'Unsupported payment method.' });

  try {
    const settings = await query('SELECT * FROM platform_settings WHERE id = 1');
    // Cheap upfront distinct-shop_id lookup across the whole cart so the
    // payment-method gate can run before any charge or order write, for
    // COD as well as real methods.
    const cartShops = await query(
      `SELECT DISTINCT p.shop_id FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = $1 AND p.status = 'active'`,
      [req.user.id]
    );
    if (cartShops.rows.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });
    const methodCheck = await assertPaymentMethodAllowed(method, cartShops.rows.map((r) => r.shop_id), settings.rows[0].payment_settings);
    if (!methodCheck.ok) return res.status(400).json({ error: methodCheck.error });
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

    const feePercent = Number(settings.rows[0].platform_fee_percent);
    const checkoutGroupId = crypto.randomUUID();

    // Same principle as createOrder(): for any real payment method, no
    // order should exist unless the payer was actually charged/prompted.
    // combinedTotal is previewed read-only (no lock, no mutation) purely to
    // know what to charge; the transaction below re-validates everything
    // under FOR UPDATE locks exactly as before and is what actually
    // creates the orders.
    let charge = null;
    if (!cod && !walletPay) {
      const preview = await query(
        `SELECT ci.quantity, p.price, p.currency, p.quantity_available, p.minimum_order_quantity, u.primary_role AS shop_owner_role
         FROM cart_items ci JOIN products p ON p.id = ci.product_id JOIN shops s ON s.id = p.shop_id
         JOIN users u ON u.id = s.owner_id
         WHERE ci.user_id = $1 AND p.status = 'active'`,
        [req.user.id]
      );
      if (preview.rows.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });
      for (const item of preview.rows) {
        if (item.quantity > item.quantity_available) return res.status(400).json({ error: 'Not enough stock for one of your cart items.' });
        if (['manufacturer', 'supplier', 'farmer'].includes(item.shop_owner_role) && item.quantity < item.minimum_order_quantity) {
          return res.status(400).json({
            error: `One of your cart items is bulk-only with a minimum order of ${item.minimum_order_quantity} units. Adjust the quantity or request a quote instead.`,
            minimumOrderQuantity: item.minimum_order_quantity
          });
        }
      }
      let previewTotal = 0;
      for (const item of preview.rows) {
        const subtotal = Number(item.price) * item.quantity;
        previewTotal += subtotal + Math.round(subtotal * feePercent) / 100;
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      try {
        charge = await adapter({
          amount: previewTotal, currency: preview.rows[0].currency, orderId: `cart-${checkoutGroupId}`,
          returnUrl: `${frontendUrl}/orders?checkoutGroup=${checkoutGroupId}`,
          phoneNumber, network
        });
      } catch (chargeErr) {
        console.error('Cart payment charge failed before order creation:', chargeErr.message);
        return res.status(502).json({ error: chargeErr.message || 'Could not start payment. No orders were created.' });
      }
    }

    // Order rows are created inside one transaction, and the stock check
    // uses SELECT ... FOR UPDATE to lock each product row for the duration
    // of the checkout — so two buyers racing to check out the last unit of
    // the same product can't both pass the "enough stock" check at once.
    let createdOrders, combinedTotal, currency;
    try {
      ({ createdOrders, combinedTotal, currency } = await withTransaction(async (client) => {
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

        // Payment rows inserted in the SAME transaction as the orders, so
        // orders and payments can never exist independently of each other.
        for (const order of orders) {
          if (cod) {
            await insertCodPayment(client.query.bind(client), { orderId: order.id, amount: order.total_amount, currency: order.currency });
          } else if (walletPay) {
            await client.query(
              `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
               VALUES ($1,'wallet',$2,$3,'initiated',NULL,$4)`,
              [order.id, order.total_amount, order.currency, { note: 'Jedida Wallet payment' }]
            );
          } else {
            await client.query(
              `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
               VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
              [order.id, method, order.total_amount, order.currency, charge.providerReference, charge.raw]
            );
          }
        }

        return { createdOrders: orders, combinedTotal: total, currency: cartResult.rows[0].currency };
      }));
    } catch (txErr) {
      if (charge) {
        console.error(`Cart order creation failed AFTER a successful charge (reference ${charge.providerReference}):`, txErr.message);
        return res.status(409).json({
          error: `Your payment was initiated (reference ${charge.providerReference}) but we could not finalize your orders — ${
            txErr.code === 'OUT_OF_STOCK' ? 'one item just sold out.' :
            txErr.code === 'MOQ_NOT_MET' ? 'one item no longer meets its minimum order quantity.' :
            txErr.code === 'EMPTY_CART' ? 'your cart changed.' :
            'please contact support.'
          } Please contact support with this reference number — do not attempt to pay again until this is resolved.`,
          providerReference: charge.providerReference
        });
      }
      throw txErr;
    }

    // Same reasoning as createOrder()'s wallet branch: orders exist now,
    // still 'pending_payment', with 'wallet' payment rows in 'initiated'.
    // Debit the buyer's wallet ONCE for the combined total, then confirm
    // every order in the group through the exact same
    // confirmCheckoutGroupOrders() a real provider's webhook would
    // eventually trigger via confirmCartPayment — not a separate copy of
    // that escrow/stock/cart-clearing logic.
    if (walletPay) {
      try {
        await payForOrder(req.user.id, checkoutGroupId, combinedTotal, currency, 'cart_checkout_payment');
      } catch (debitErr) {
        if (debitErr.code === 'INSUFFICIENT_FUNDS') {
          return res.status(400).json({
            error: 'Insufficient wallet balance for this order. Your orders were created and are waiting for payment — choose another payment method to complete checkout.',
            orders: createdOrders, checkoutGroupId, combinedTotal
          });
        }
        console.error('Wallet debit failed after cart order creation:', debitErr);
        return res.status(500).json({ error: 'Could not charge your wallet. Your orders were created but are not yet paid — please try again.', orders: createdOrders, checkoutGroupId });
      }
      try {
        await confirmCheckoutGroupOrders(checkoutGroupId, req.user.id, { confirmedVia: 'wallet' });
      } catch (confirmErr) {
        console.error(`Wallet debited for checkout group ${checkoutGroupId} but confirmation failed:`, confirmErr.message);
        return res.status(500).json({
          error: 'Your wallet was charged but we could not finalize your orders. Please contact support — do not pay again.',
          checkoutGroupId
        });
      }
    }

    for (const order of createdOrders) {
      await safeGenerateDocument(() => createOrderConfirmation(order.id), 'order_confirmation:checkoutCart');
    }

    return res.status(201).json({
      message: cod
        ? `Created ${createdOrders.length} order(s) from your cart. Pay the delivery agent in cash when your order arrives.`
        : walletPay
          ? `Paid for ${createdOrders.length} order(s) from your Jedida Wallet and moved into escrow.`
          : `Created ${createdOrders.length} order(s) from your cart. Complete payment to move funds into escrow.`,
      orders: createdOrders, checkoutGroupId, codPending: cod, walletPaid: walletPay,
      combinedTotal, checkoutUrl: charge?.checkoutUrl, providerReference: charge?.providerReference
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
// the cart of the items that were just purchased. Extracted from the HTTP
// handler below so checkoutCart()'s wallet branch can call the exact same
// per-order confirmation logic synchronously (no webhook to wait on for an
// internal debit) instead of a parallel copy of it.
async function confirmCheckoutGroupOrders(checkoutGroupId, buyerId, { confirmedVia } = {}) {
  const orders = await query(`SELECT id FROM orders WHERE checkout_group_id = $1 AND buyer_id = $2`, [checkoutGroupId, buyerId]);
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
        referenceType: 'order_escrow', referenceId: order.id, note: `Cart checkout — buyer payment held in escrow (confirmed via ${confirmedVia || 'unknown'})`, createdBy: buyerId
      });
      await client.query(
        `INSERT INTO escrow_ledger (order_id, direction, amount, note, created_by) VALUES ($1,'in',$2,$3,$4)`,
        [order.id, order.total_amount, `Cart checkout — buyer payment held in escrow (confirmed via ${confirmedVia || 'unknown'})`, buyerId]
      );
      await client.query(
        `UPDATE products SET quantity_available = quantity_available - $1, orders_count = orders_count + 1 WHERE id = $2`,
        [order.quantity, order.product_id]
      );
      await client.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [buyerId, order.product_id]);

      const shop = await client.query('SELECT owner_id FROM shops WHERE id = $1', [order.shop_id]);

      // Same unified ledger record as the single-order path above
      // (applyPaymentConfirmation) — this function is the cart-checkout
      // equivalent and has its own separate escrow-crediting logic (see
      // module comment at its definition), so it needs its own ledger
      // hook rather than inheriting one from applyPaymentConfirmation.
      const paymentRowForLedger = await client.query('SELECT method, provider_reference FROM payments WHERE order_id = $1 LIMIT 1', [orderId]);
      await postTransaction(client, {
        idempotencyKey: `order_payment:${order.id}`,
        transactionType: 'order_payment',
        status: 'succeeded',
        source: 'marketplace',
        amount: order.total_amount,
        feeAmount: order.platform_fee_amount || 0,
        currency: order.currency,
        orderId: order.id,
        orderPublicRef: order.public_ref,
        buyerId: order.buyer_id,
        sellerId: shop.rows[0]?.owner_id || null,
        shopId: order.shop_id,
        actorId: buyerId,
        destinationWalletId: escrowWallet.rows[0].id,
        paymentMethod: paymentRowForLedger.rows[0]?.method || null,
        providerReference: paymentRowForLedger.rows[0]?.provider_reference || null,
        metadata: { confirmedVia: confirmedVia || 'unknown', checkoutGroupId },
        createdBy: buyerId,
      });
      await setOrderFinancialState(client, { orderId: order.id, financialState: 'funds_controlled' });

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
  return confirmedCount;
}

export async function confirmCartPayment(req, res) {
  const { checkoutGroupId } = req.params;

  try {
    const orderCheck = await query(`SELECT id FROM orders WHERE checkout_group_id = $1 AND buyer_id = $2`, [checkoutGroupId, req.user.id]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Checkout group not found.' });

    // Same sandbox-only restriction as confirmPayment() above: this is a
    // manual dev-flow endpoint, not a real payment confirmation. Any
    // order in the group that was charged through a real (non-sandbox)
    // provider key can only be confirmed by that provider's
    // signature-verified webhook.
    const orderIds = orderCheck.rows.map((o) => o.id);
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

    const confirmedCount = await confirmCheckoutGroupOrders(checkoutGroupId, req.user.id, { confirmedVia: 'sandbox_manual' });

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

  // The frontend (PaymentCenter.jsx) sends this as multipart/form-data
  // with the proof screenshot as a binary file field named `proof` — not
  // as a `proofImage` URL string in a JSON body. This route is mounted
  // behind multer (see routes/orders.js), so text fields land in
  // req.body and the file lands in req.file, same shape as every other
  // upload endpoint on this platform.
  const {
    phoneNumber,
    transactionReference
  } = req.body;

  if (!transactionReference || !req.file) {
    return res.status(400).json({ error: 'A transaction reference and proof image are required.' });
  }

  if (!isCloudinaryConfigured()) {
    return res.status(501).json({
      error: 'Payment proof upload is not configured on this server yet. Please contact support.'
    });
  }

  const check = await validateUploadAny(req.file, ['image', 'document'], {
    userId: req.user.id,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown'
  });
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  let proofImage;
  try {
    const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'image';
    const uploaded = await uploadToCloudinary(req.file.buffer, req.file.originalname, resourceType, 'jedida-marketplace/payment-proofs');
    proofImage = uploaded.url;
  } catch (err) {
    console.error('Payment proof upload failed:', err.message);
    return res.status(502).json({ error: 'Could not upload your payment proof. Please try again shortly.' });
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
