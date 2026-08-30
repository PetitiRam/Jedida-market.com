// JEDIDA Financial Ledger service — phase 94.
//
// This is the single place that writes to financial_transactions. Every
// channel (marketplace checkout, POS, wallet deposit/withdraw/transfer,
// partner apps) posts through postTransaction() instead of writing its
// own ad-hoc transaction record, so there is exactly one authoritative
// omnichannel ledger to build the Financial Control Center, seller
// financial dashboard, and reconciliation tooling on top of.
//
// This does NOT replace wallet_transactions/escrow_ledger — those still
// get written by the existing code paths (ordersController.js,
// walletsController.js) exactly as before, because they're what actually
// drives wallets.balance today and rewriting that is out of scope for
// this pass. postTransaction() is additive: it records the same event
// in the new unified shape alongside whatever wallet-level bookkeeping
// already happened, inside the same DB transaction.
//
// Every call site must run inside an existing `withTransaction(client)`
// block (see config/db.js) and pass that `client` in — postTransaction
// itself does not open a transaction, so it always lands atomically with
// the wallet/order writes around it.

import crypto from 'crypto';

// Short human-readable reference, distinct from the provider's own
// transaction id. Not used as a security token, so a compact charset is
// fine — collisions are handled by the UNIQUE constraint + retry below.
function generateTransactionReference() {
  const random = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `TXN-${random}`;
}

/**
 * Post one financial_transactions row. Idempotent: if a row already
 * exists for `idempotencyKey`, that existing row is returned instead of
 * inserting a duplicate — callers do not need to pre-check.
 *
 * @param {import('pg').PoolClient} client - an open transaction client
 * @param {object} input
 * @param {string} input.idempotencyKey - stable key for this exact
 *   money movement (e.g. `order_payment:${orderId}`,
 *   `pos_sale:${registerId}:${localSaleId}`,
 *   `withdrawal:${withdrawalRequestId}`). Repeated calls with the same
 *   key are safe no-ops after the first.
 * @param {string} input.transactionType - one of financial_transaction_type
 * @param {string} input.status - one of financial_transaction_status (default 'succeeded')
 * @param {string} input.source - one of financial_transaction_source
 * @param {number} input.amount
 * @param {number} [input.feeAmount=0]
 * @param {number} [input.netAmount] - defaults to amount - feeAmount
 * @param {string} [input.currency='USD']
 * @param {string} [input.orderId]
 * @param {string} [input.orderPublicRef]
 * @param {string} [input.buyerId]
 * @param {string} [input.sellerId]
 * @param {string} [input.shopId]
 * @param {string} [input.actorId] - who/what caused this (cashier, admin, buyer, or null for system)
 * @param {string} [input.sourceWalletId]
 * @param {string} [input.destinationWalletId]
 * @param {string} [input.paymentMethod]
 * @param {string} [input.providerCode]
 * @param {string} [input.providerTransactionId]
 * @param {string} [input.providerReference]
 * @param {object} [input.metadata]
 * @param {string} [input.createdBy]
 * @returns {Promise<{row: object, duplicate: boolean}>}
 */
export async function postTransaction(client, input) {
  const {
    idempotencyKey,
    transactionType,
    status = 'succeeded',
    source,
    amount,
    feeAmount = 0,
    netAmount,
    currency = 'USD',
    orderId = null,
    orderPublicRef = null,
    buyerId = null,
    sellerId = null,
    shopId = null,
    actorId = null,
    sourceWalletId = null,
    destinationWalletId = null,
    paymentMethod = null,
    providerCode = null,
    providerTransactionId = null,
    providerReference = null,
    failureReason = null,
    metadata = {},
    createdBy = null,
  } = input;

  if (!idempotencyKey) throw new Error('postTransaction requires idempotencyKey.');
  if (!transactionType) throw new Error('postTransaction requires transactionType.');
  if (!source) throw new Error('postTransaction requires source.');
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    throw new Error('postTransaction requires a numeric amount.');
  }

  const resolvedNet = netAmount !== undefined && netAmount !== null
    ? netAmount
    : Number(amount) - Number(feeAmount || 0);

  const reference = generateTransactionReference();

  // ON CONFLICT DO NOTHING + a follow-up SELECT is the standard safe
  // pattern here: it never risks a duplicate row even under concurrent
  // requests (two webhook deliveries racing each other), because the
  // UNIQUE constraint on idempotency_key is enforced by Postgres itself,
  // not by an application-level check-then-insert.
  const insertResult = await client.query(
    `INSERT INTO financial_transactions (
       reference, transaction_type, status, source,
       order_id, order_public_ref, buyer_id, seller_id, shop_id, actor_id,
       source_wallet_id, destination_wallet_id,
       amount, fee_amount, net_amount, currency,
       payment_method, provider_code, provider_transaction_id, provider_reference,
       failure_reason, metadata, created_by, idempotency_key
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,$7,$8,$9,$10,
       $11,$12,
       $13,$14,$15,$16,
       $17,$18,$19,$20,
       $21,$22,$23,$24
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      reference, transactionType, status, source,
      orderId, orderPublicRef, buyerId, sellerId, shopId, actorId,
      sourceWalletId, destinationWalletId,
      amount, feeAmount, resolvedNet, currency,
      paymentMethod, providerCode, providerTransactionId, providerReference,
      failureReason, JSON.stringify(metadata || {}), createdBy, idempotencyKey,
    ]
  );

  if (insertResult.rows.length > 0) {
    await recordEvent(client, { transactionId: insertResult.rows[0].id, previousStatus: null, newStatus: status, actorId: createdBy || actorId });
    return { row: insertResult.rows[0], duplicate: false };
  }

  const existing = await client.query(
    `SELECT * FROM financial_transactions WHERE idempotency_key = $1`,
    [idempotencyKey]
  );
  return { row: existing.rows[0], duplicate: true };
}

async function recordEvent(client, { transactionId, previousStatus, newStatus, reason = null, actorId = null, ipAddress = null }) {
  await client.query(
    `INSERT INTO financial_transaction_events (transaction_id, previous_status, new_status, reason, actor_id, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [transactionId, previousStatus, newStatus, reason, actorId, ipAddress]
  );
}

/**
 * Transition an existing transaction's status, recording a
 * financial_transaction_events row. Never mutates amount/fee/net —
 * those are immutable once posted; a correction is a new compensating
 * transaction (transaction_type: 'reversal' or 'adjustment') that
 * references the original via metadata, not an edit of it.
 */
export async function updateTransactionStatus(client, { transactionId, newStatus, reason = null, actorId = null, ipAddress = null }) {
  const current = await client.query('SELECT status FROM financial_transactions WHERE id = $1 FOR UPDATE', [transactionId]);
  if (current.rows.length === 0) {
    const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err;
  }
  const previousStatus = current.rows[0].status;
  await client.query('UPDATE financial_transactions SET status = $1 WHERE id = $2', [newStatus, transactionId]);
  await recordEvent(client, { transactionId, previousStatus, newStatus, reason, actorId, ipAddress });
}

/** Set an order's financial_state (funds_pending / funds_controlled / releasable / released / blocked / reversed / refunded). */
export async function setOrderFinancialState(client, { orderId, financialState, reason = null }) {
  await client.query(
    `UPDATE orders SET financial_state = $2, financial_hold_reason = CASE WHEN $2 = 'blocked' THEN $3 ELSE financial_hold_reason END WHERE id = $1`,
    [orderId, financialState, reason]
  );
}

/** Set an order's release_state (not_applicable / pending / eligible / released / blocked). */
export async function setOrderReleaseState(client, { orderId, releaseState }) {
  await client.query(`UPDATE orders SET release_state = $2 WHERE id = $1`, [orderId, releaseState]);
}

/**
 * Paginated, filterable read of the unified transaction feed — the data
 * source for the Financial Control Center's transaction stream.
 * Cursor-based on created_at+id to stay stable across pages even while
 * new rows are being inserted (spec #56: never load the entire history
 * at once).
 */
export async function getTransactionFeed({
  limit = 50,
  cursorCreatedAt = null,
  cursorId = null,
  transactionType = null,
  status = null,
  source = null,
  sellerId = null,
  buyerId = null,
  orderPublicRef = null,
  providerCode = null,
  reconciliationStatus = null,
} = {}, queryFn) {
  const conditions = [];
  const params = [];
  let p = 0;

  const add = (clause, value) => { params.push(value); p += 1; conditions.push(clause.replace('$?', `$${p}`)); };

  if (transactionType) add('transaction_type = $?', transactionType);
  if (status) add('status = $?', status);
  if (source) add('source = $?', source);
  if (sellerId) add('seller_id = $?', sellerId);
  if (buyerId) add('buyer_id = $?', buyerId);
  if (orderPublicRef) add('order_public_ref = $?', orderPublicRef);
  if (providerCode) add('provider_code = $?', providerCode);
  if (reconciliationStatus) add('reconciliation_status = $?', reconciliationStatus);

  if (cursorCreatedAt && cursorId) {
    add('(created_at, id) < ($?', cursorCreatedAt);
    params.push(cursorId); p += 1;
    conditions[conditions.length - 1] = conditions[conditions.length - 1] + `, $${p})`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  params.push(safeLimit); p += 1;

  const sql = `SELECT * FROM financial_transactions ${where} ORDER BY created_at DESC, id DESC LIMIT $${p}`;
  const result = await queryFn(sql, params);
  const rows = result.rows;
  const nextCursor = rows.length === safeLimit
    ? { cursorCreatedAt: rows[rows.length - 1].created_at, cursorId: rows[rows.length - 1].id }
    : null;
  return { rows, nextCursor };
}
