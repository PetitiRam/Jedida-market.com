// JEDIDA POS controller — phase 98.
//
// A POS sale is not a separate system: it creates real `orders` rows
// (channel='pos'), decrements the same products.quantity_available every
// other channel uses, and posts to the same financial_transactions
// ledger a marketplace order does. The only genuinely different rule is
// that a POS order completes immediately — see the schema file's header
// comment for why that's correct rather than a shortcut.

import crypto from 'crypto';
import { query, withTransaction } from '../config/db.js';
import { postTransaction, setOrderFinancialState, setOrderReleaseState } from '../services/ledgerService.js';
import { logWalletTransaction } from './ordersController.js';
import { getSellerEnabledMethods } from '../services/providerAbstraction.js';

const ROLE_DEFAULT_PERMISSIONS = {
  cashier: { can_discount: false, can_refund: false, can_void: false, can_access_cash_drawer: true, can_override_price: false, can_view_reports: false, can_close_register: false, can_cancel_transaction: false },
  supervisor: { can_discount: true, can_refund: true, can_void: true, can_access_cash_drawer: true, can_override_price: false, can_view_reports: true, can_close_register: true, can_cancel_transaction: true },
  store_manager: { can_discount: true, can_refund: true, can_void: true, can_access_cash_drawer: true, can_override_price: true, can_view_reports: true, can_close_register: true, can_cancel_transaction: true },
  pos_administrator: { can_discount: true, can_refund: true, can_void: true, can_access_cash_drawer: true, can_override_price: true, can_view_reports: true, can_close_register: true, can_cancel_transaction: true },
};

async function getShopForOwner(userId) {
  const result = await query('SELECT * FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0] || null;
}

// Every POS action needs to know who's acting and what they're allowed to
// do. The shop owner always has full access even without a pos_staff row
// (spec: "a seller/merchant must first configure the POS" — the owner is
// implicitly the first POS administrator of their own shop).
async function getStaffContext(shopId, userId) {
  const shopResult = await query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);
  const shop = shopResult.rows[0];
  if (!shop) return null;
  if (shop.owner_id === userId) {
    return { role: 'owner', shopId, userId, permissions: ROLE_DEFAULT_PERMISSIONS.pos_administrator, registerId: null };
  }
  const staffResult = await query(
    `SELECT * FROM pos_staff WHERE shop_id = $1 AND user_id = $2 AND status = 'active'`,
    [shopId, userId]
  );
  const staff = staffResult.rows[0];
  if (!staff) return null;
  return {
    role: staff.role,
    shopId,
    userId,
    registerId: staff.register_id,
    permissions: {
      can_discount: staff.can_discount, can_refund: staff.can_refund, can_void: staff.can_void,
      can_access_cash_drawer: staff.can_access_cash_drawer, can_override_price: staff.can_override_price,
      can_view_reports: staff.can_view_reports, can_close_register: staff.can_close_register,
      can_cancel_transaction: staff.can_cancel_transaction,
    },
  };
}

// ===== SETUP (spec #4 "Business") =====

// GET /api/pos/setup
export async function getPosSetup(req, res) {
  try {
    const shop = await getShopForOwner(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Open your shop before setting up POS.' });
    const result = await query('SELECT * FROM pos_configurations WHERE shop_id = $1', [shop.id]);
    res.json({ configuration: result.rows[0] || null, shopId: shop.id });
  } catch (err) {
    console.error('getPosSetup failed:', err);
    res.status(500).json({ error: 'Could not load POS setup.' });
  }
}

// POST /api/pos/setup
export async function savePosSetup(req, res) {
  try {
    const shop = await getShopForOwner(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Open your shop before setting up POS.' });
    const { businessName, storeName, storeLocation, currency = 'USD', timezone = 'UTC', receiptSettings = {} } = req.body;
    if (!businessName || !storeName) return res.status(400).json({ error: 'Business name and store name are required.' });

    const result = await query(
      `INSERT INTO pos_configurations (shop_id, business_name, store_name, store_location, currency, timezone, receipt_settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (shop_id) DO UPDATE SET
         business_name = $2, store_name = $3, store_location = $4, currency = $5, timezone = $6, receipt_settings = $7, updated_at = now()
       RETURNING *`,
      [shop.id, businessName, storeName, storeLocation || null, currency, timezone, JSON.stringify(receiptSettings)]
    );
    res.json({ configuration: result.rows[0] });
  } catch (err) {
    console.error('savePosSetup failed:', err);
    res.status(500).json({ error: 'Could not save POS setup.' });
  }
}

// ===== REGISTERS (spec #4 "Registers") =====

// GET /api/pos/registers
export async function listRegisters(req, res) {
  try {
    const shop = await getShopForOwner(req.user.id);
    const shopId = shop ? shop.id : (await getStaffContext(req.query.shopId, req.user.id))?.shopId;
    if (!shopId) return res.status(404).json({ error: 'Shop not found.' });
    const result = await query('SELECT * FROM pos_registers WHERE shop_id = $1 ORDER BY label ASC', [shopId]);
    res.json({ registers: result.rows });
  } catch (err) {
    console.error('listRegisters failed:', err);
    res.status(500).json({ error: 'Could not load registers.' });
  }
}

// POST /api/pos/registers  { label, location }
export async function createRegister(req, res) {
  try {
    const shop = await getShopForOwner(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Open your shop before creating a register.' });
    const { label, location } = req.body;
    if (!label) return res.status(400).json({ error: 'Register label is required, e.g. "Register 01".' });
    const result = await query(
      `INSERT INTO pos_registers (shop_id, label, location) VALUES ($1,$2,$3) RETURNING *`,
      [shop.id, label, location || null]
    );
    res.status(201).json({ register: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A register with that label already exists.' });
    console.error('createRegister failed:', err);
    res.status(500).json({ error: 'Could not create register.' });
  }
}

// POST /api/pos/registers/:registerId/open  { openingCashAmount }
export async function openRegister(req, res) {
  try {
    const registerResult = await query('SELECT * FROM pos_registers WHERE id = $1', [req.params.registerId]);
    const register = registerResult.rows[0];
    if (!register) return res.status(404).json({ error: 'Register not found.' });
    const staff = await getStaffContext(register.shop_id, req.user.id);
    if (!staff) return res.status(403).json({ error: 'You are not authorized on this POS.' });

    const result = await query(
      `UPDATE pos_registers SET status = 'open', opened_by = $2, opened_at = now(), opening_cash_amount = $3,
              closed_by = NULL, closed_at = NULL, closing_cash_amount = NULL
       WHERE id = $1 RETURNING *`,
      [register.id, req.user.id, req.body.openingCashAmount ?? 0]
    );
    res.json({ register: result.rows[0] });
  } catch (err) {
    console.error('openRegister failed:', err);
    res.status(500).json({ error: 'Could not open register.' });
  }
}

// POST /api/pos/registers/:registerId/close  { closingCashAmount }
export async function closeRegister(req, res) {
  try {
    const registerResult = await query('SELECT * FROM pos_registers WHERE id = $1', [req.params.registerId]);
    const register = registerResult.rows[0];
    if (!register) return res.status(404).json({ error: 'Register not found.' });
    const staff = await getStaffContext(register.shop_id, req.user.id);
    if (!staff) return res.status(403).json({ error: 'You are not authorized on this POS.' });
    if (!staff.permissions.can_close_register) return res.status(403).json({ error: 'You do not have permission to close a register.' });

    const result = await query(
      `UPDATE pos_registers SET status = 'closed', closed_by = $2, closed_at = now(), closing_cash_amount = $3
       WHERE id = $1 RETURNING *`,
      [register.id, req.user.id, req.body.closingCashAmount ?? 0]
    );
    res.json({ register: result.rows[0] });
  } catch (err) {
    console.error('closeRegister failed:', err);
    res.status(500).json({ error: 'Could not close register.' });
  }
}

// ===== STAFF (spec #4 "Staff") =====

// GET /api/pos/staff
export async function listStaff(req, res) {
  try {
    const shop = await getShopForOwner(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found.' });
    const result = await query(
      `SELECT ps.*, u.full_name, u.email FROM pos_staff ps JOIN users u ON u.id = ps.user_id WHERE ps.shop_id = $1 ORDER BY u.full_name`,
      [shop.id]
    );
    res.json({ staff: result.rows });
  } catch (err) {
    console.error('listStaff failed:', err);
    res.status(500).json({ error: 'Could not load POS staff.' });
  }
}

// POST /api/pos/staff  { userId, role, registerId, permissions? }
// Only the shop owner (or a pos_administrator) assigns POS roles.
export async function addStaff(req, res) {
  try {
    const shop = await getShopForOwner(req.user.id);
    let shopId = shop?.id;
    if (!shopId) {
      const ctx = await getStaffContext(req.body.shopId, req.user.id);
      if (!ctx || ctx.role !== 'pos_administrator') return res.status(403).json({ error: 'Only a POS administrator can add staff.' });
      shopId = ctx.shopId;
    }
    const { userId, role = 'cashier', registerId, permissions = {} } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    if (!ROLE_DEFAULT_PERMISSIONS[role]) return res.status(400).json({ error: 'Invalid POS role.' });

    const merged = { ...ROLE_DEFAULT_PERMISSIONS[role], ...permissions };
    const result = await query(
      `INSERT INTO pos_staff (shop_id, user_id, role, register_id, can_discount, can_refund, can_void, can_access_cash_drawer, can_override_price, can_view_reports, can_close_register, can_cancel_transaction)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (shop_id, user_id) DO UPDATE SET
         role = $3, register_id = $4, can_discount = $5, can_refund = $6, can_void = $7, can_access_cash_drawer = $8,
         can_override_price = $9, can_view_reports = $10, can_close_register = $11, can_cancel_transaction = $12,
         status = 'active', updated_at = now()
       RETURNING *`,
      [shopId, userId, role, registerId || null, merged.can_discount, merged.can_refund, merged.can_void, merged.can_access_cash_drawer, merged.can_override_price, merged.can_view_reports, merged.can_close_register, merged.can_cancel_transaction]
    );
    res.status(201).json({ staff: result.rows[0] });
  } catch (err) {
    console.error('addStaff failed:', err);
    res.status(500).json({ error: 'Could not add POS staff.' });
  }
}

// POST /api/pos/staff/:staffId/deactivate
export async function deactivateStaff(req, res) {
  try {
    const shop = await getShopForOwner(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found.' });
    const result = await query(
      `UPDATE pos_staff SET status = 'inactive', updated_at = now() WHERE id = $1 AND shop_id = $2 RETURNING *`,
      [req.params.staffId, shop.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Staff member not found.' });
    res.json({ staff: result.rows[0] });
  } catch (err) {
    console.error('deactivateStaff failed:', err);
    res.status(500).json({ error: 'Could not deactivate staff member.' });
  }
}

// ===== PRODUCT SEARCH (spec #7 barcode/SKU/search) =====

// GET /api/pos/products/search?shopId=&q=&barcode=
export async function searchPosProducts(req, res) {
  try {
    const { shopId, q, barcode } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId is required.' });

    if (barcode) {
      // Barcode scan should resolve immediately to a single product —
      // exact SKU match, no fuzzy search, no extra navigation (spec #7).
      const result = await query(
        `SELECT id, title, price, currency, sku, quantity_available, images FROM products
         WHERE shop_id = $1 AND status = 'active' AND sku = $2 LIMIT 1`,
        [shopId, barcode]
      );
      return res.json({ product: result.rows[0] || null });
    }

    const result = await query(
      `SELECT id, title, price, currency, sku, quantity_available, images, category FROM products
       WHERE shop_id = $1 AND status = 'active' AND (title ILIKE $2 OR sku ILIKE $2)
       ORDER BY orders_count DESC LIMIT 40`,
      [shopId, `%${q || ''}%`]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('searchPosProducts failed:', err);
    res.status(500).json({ error: 'Could not search products.' });
  }
}

// GET /api/pos/payment-methods?shopId=
// The cashier's payment screen reads this — never a hard-coded list
// (spec #8). Cash is always offered; everything else comes from the
// provider abstraction (phase 96), so a POS instantly reflects whatever
// the seller has actually enabled at Payment Providers.
export async function listPosPaymentMethods(req, res) {
  try {
    const methods = await getSellerEnabledMethods(req.query.shopId);
    res.json({
      methods: [
        { code: 'cash', name: 'Cash', providerCode: 'cash', providerName: 'Cash' },
        ...methods.map((m) => ({ code: m.code, name: m.name, providerCode: m.provider_code, providerName: m.provider_name })),
      ],
    });
  } catch (err) {
    console.error('listPosPaymentMethods failed:', err);
    res.status(500).json({ error: 'Could not load payment methods.' });
  }
}

// ===== SALE (spec #6/#8: cart -> payment -> receipt -> inventory -> ledger) =====

// POST /api/pos/sales
// { shopId, registerId, items:[{productId, quantity, unitPriceOverride?, discount?}], paymentMethod, customerName?, customerPhone? }
export async function createSale(req, res) {
  const { shopId, registerId, items, paymentMethod, customerName, customerPhone, clientSaleUuid } = req.body;
  if (!shopId || !registerId || !Array.isArray(items) || items.length === 0 || !paymentMethod) {
    return res.status(400).json({ error: 'shopId, registerId, at least one item, and paymentMethod are required.' });
  }
  // Required, not optional — the register (and always the offline queue)
  // must generate one client_sale_uuid per physical sale so a dropped-
  // connection retry or an offline-queue resync can never ring the same
  // sale up twice. Ported from Jedida-market_com_phase11's posService.js;
  // see INTEGRATION_DECISION_REPORT.md section 4 for why the ledger-
  // posting key alone (below) doesn't cover this.
  if (!clientSaleUuid) {
    return res.status(400).json({ error: 'Missing clientSaleUuid.' });
  }

  try {
    // Idempotent replay: return the original result instead of creating a
    // second sale/order/charge.
    const already = await query('SELECT checkout_group_id FROM pos_sale_batches WHERE client_sale_uuid = $1', [clientSaleUuid]);
    if (already.rows[0]) {
      const existingOrders = await query('SELECT * FROM orders WHERE checkout_group_id = $1', [already.rows[0].checkout_group_id]);
      const total = existingOrders.rows.reduce((sum, o) => sum + Number(o.total_amount), 0);
      return res.status(200).json({
        checkoutGroupId: already.rows[0].checkout_group_id, orders: existingOrders.rows,
        total, currency: existingOrders.rows[0]?.currency, replay: true
      });
    }

    const staff = await getStaffContext(shopId, req.user.id);
    if (!staff) return res.status(403).json({ error: 'You are not authorized on this POS.' });

    const hasDiscount = items.some((i) => Number(i.discount || 0) > 0);
    if (hasDiscount && !staff.permissions.can_discount) {
      return res.status(403).json({ error: 'You do not have permission to apply discounts.' });
    }
    const hasOverride = items.some((i) => i.unitPriceOverride !== undefined && i.unitPriceOverride !== null);
    if (hasOverride && !staff.permissions.can_override_price) {
      return res.status(403).json({ error: 'You do not have permission to override prices.' });
    }
    if (paymentMethod === 'cash' && !staff.permissions.can_access_cash_drawer) {
      return res.status(403).json({ error: 'You do not have permission to take cash payments.' });
    }

    const registerResult = await query('SELECT * FROM pos_registers WHERE id = $1 AND shop_id = $2', [registerId, shopId]);
    if (!registerResult.rows[0]) return res.status(404).json({ error: 'Register not found.' });
    if (registerResult.rows[0].status !== 'open') return res.status(400).json({ error: 'Open this register before taking a sale.' });

    const shopResult = await query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);
    const sellerId = shopResult.rows[0]?.owner_id;

    const settingsResult = await query('SELECT platform_fee_percent FROM platform_settings WHERE id = 1');
    const feePercent = Number(settingsResult.rows[0]?.platform_fee_percent ?? 5);

    const checkoutGroupId = crypto.randomUUID();
    const createdOrders = [];
    let saleTotal = 0;
    let saleCurrency = 'USD';

    await withTransaction(async (client) => {
      // Claim the idempotency key FIRST, inside the same transaction as
      // everything else below — a UNIQUE violation here (two concurrent
      // requests racing with the same clientSaleUuid) aborts the whole
      // transaction before any order/wallet/ledger write happens, rather
      // than after.
      try {
        await client.query(
          'INSERT INTO pos_sale_batches (client_sale_uuid, shop_id, checkout_group_id, cashier_id) VALUES ($1,$2,$3,$4)',
          [clientSaleUuid, shopId, checkoutGroupId, req.user.id]
        );
      } catch (insertErr) {
        if (insertErr.code === '23505') {
          const err = new Error('DUPLICATE_SALE'); err.code = 'DUPLICATE_SALE'; throw err;
        }
        throw insertErr;
      }

      const sellerWallet = await client.query(`SELECT id FROM wallets WHERE owner_id = $1 AND type = 'user'`, [sellerId]);
      if (!sellerWallet.rows[0]) throw Object.assign(new Error('SELLER_WALLET_MISSING'), { code: 'SELLER_WALLET_MISSING' });

      for (const item of items) {
        const productResult = await client.query(
          `UPDATE products SET quantity_available = quantity_available - $1, orders_count = orders_count + 1
           WHERE id = $2 AND shop_id = $3 AND quantity_available >= $1
           RETURNING id, title, price, currency`,
          [item.quantity || 1, item.productId, shopId]
        );
        const product = productResult.rows[0];
        if (!product) {
          throw Object.assign(new Error('OUT_OF_STOCK'), { code: 'OUT_OF_STOCK', productId: item.productId });
        }

        const unitPrice = item.unitPriceOverride !== undefined && item.unitPriceOverride !== null
          ? Number(item.unitPriceOverride) : Number(product.price);
        const discount = Number(item.discount || 0);
        const lineTotal = Math.max(0, unitPrice * (item.quantity || 1) - discount);
        const platformFeeAmount = Math.round(lineTotal * (feePercent / 100) * 100) / 100;
        saleTotal += lineTotal;
        saleCurrency = product.currency;

        const orderResult = await client.query(
          `INSERT INTO orders (
             buyer_id, shop_id, product_id, quantity, unit_price, currency,
             platform_fee_percent, platform_fee_amount, total_amount,
             status, channel, register_id, cashier_id, customer_name, customer_phone, checkout_group_id
           ) VALUES (
             NULL, $1, $2, $3, $4, $5,
             $6, $7, $8,
             'completed', 'pos', $9, $10, $11, $12, $13
           ) RETURNING *`,
          [shopId, item.productId, item.quantity || 1, unitPrice, product.currency,
           feePercent, platformFeeAmount, lineTotal,
           registerId, req.user.id, customerName || null, customerPhone || null, checkoutGroupId]
        );
        const order = orderResult.rows[0];
        createdOrders.push(order);

        const sellerPayable = lineTotal - platformFeeAmount;
        const walletBalance = await client.query('SELECT balance FROM wallets WHERE id = $1 FOR UPDATE', [sellerWallet.rows[0].id]);
        const newBalance = Number(walletBalance.rows[0].balance) + sellerPayable;
        await client.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newBalance, sellerWallet.rows[0].id]);
        await logWalletTransaction(client, {
          walletId: sellerWallet.rows[0].id, direction: 'credit', amount: sellerPayable, balanceAfter: newBalance,
          referenceType: 'pos_sale', referenceId: order.id, note: `POS sale — ${product.title}`, createdBy: req.user.id,
        });

        await postTransaction(client, {
          idempotencyKey: `pos_payment:${order.id}`,
          transactionType: 'pos_payment',
          status: 'succeeded',
          source: 'pos',
          amount: lineTotal,
          feeAmount: platformFeeAmount,
          netAmount: sellerPayable,
          currency: product.currency,
          orderId: order.id,
          orderPublicRef: order.public_ref,
          sellerId,
          shopId,
          actorId: req.user.id,
          destinationWalletId: sellerWallet.rows[0].id,
          paymentMethod,
          providerCode: paymentMethod === 'cash' ? 'cash' : null,
          metadata: { registerId, cashierId: req.user.id },
          createdBy: req.user.id,
        });
        // A POS sale hands goods over in person right now — there is no
        // shipping window to protect a buyer against, so funds are
        // released to the seller immediately rather than held under
        // funds_controlled first (see schema file header for the
        // reasoning this mirrors real point-of-sale settlement).
        await setOrderFinancialState(client, { orderId: order.id, financialState: 'released' });
        await setOrderReleaseState(client, { orderId: order.id, releaseState: 'released' });
      }
    });

    res.status(201).json({ checkoutGroupId, orders: createdOrders, total: saleTotal, currency: saleCurrency });
  } catch (err) {
    if (err.code === 'DUPLICATE_SALE') {
      // Lost a race against a concurrent identical request — same
      // handling as the pre-check above, just reached via the UNIQUE
      // constraint instead of the SELECT.
      const existing = await query('SELECT checkout_group_id FROM pos_sale_batches WHERE client_sale_uuid = $1', [clientSaleUuid]);
      const existingOrders = await query('SELECT * FROM orders WHERE checkout_group_id = $1', [existing.rows[0].checkout_group_id]);
      const total = existingOrders.rows.reduce((sum, o) => sum + Number(o.total_amount), 0);
      return res.status(200).json({
        checkoutGroupId: existing.rows[0].checkout_group_id, orders: existingOrders.rows,
        total, currency: existingOrders.rows[0]?.currency, replay: true
      });
    }
    if (err.code === 'OUT_OF_STOCK') return res.status(409).json({ error: 'One of these items just went out of stock.', productId: err.productId });
    if (err.code === 'SELLER_WALLET_MISSING') return res.status(500).json({ error: 'Seller wallet is not set up yet.' });
    console.error('createSale failed:', err);
    res.status(500).json({ error: 'Could not complete this sale.' });
  }
}

// ===== UNIFIED ANALYTICS (spec #46: POS + online in one report) =====

// GET /api/pos/analytics/today?shopId=
export async function getTodaySalesSummary(req, res) {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId is required.' });
    const result = await query(
      `SELECT channel, COUNT(DISTINCT checkout_group_id) FILTER (WHERE checkout_group_id IS NOT NULL) AS grouped_orders,
              COUNT(*) FILTER (WHERE checkout_group_id IS NULL) AS ungrouped_orders,
              COALESCE(SUM(total_amount), 0) AS total
       FROM orders
       WHERE shop_id = $1 AND created_at >= date_trunc('day', now()) AND status NOT IN ('cancelled')
       GROUP BY channel`,
      [shopId]
    );
    const byChannel = { online: { orders: 0, total: 0 }, pos: { orders: 0, total: 0 } };
    for (const row of result.rows) {
      const key = row.channel === 'pos' ? 'pos' : 'online';
      byChannel[key].orders += Number(row.grouped_orders) + Number(row.ungrouped_orders);
      byChannel[key].total += Number(row.total);
    }
    res.json({
      today: {
        total: byChannel.online.total + byChannel.pos.total,
        online: byChannel.online.total,
        pos: byChannel.pos.total,
        onlineOrders: byChannel.online.orders,
        posOrders: byChannel.pos.orders,
      },
    });
  } catch (err) {
    console.error('getTodaySalesSummary failed:', err);
    res.status(500).json({ error: 'Could not load today\'s sales summary.' });
  }
}
