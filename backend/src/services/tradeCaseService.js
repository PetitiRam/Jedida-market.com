import { query, withTransaction } from '../config/db.js';

// A "trade case" is not a new entity — it's the existing order (optionally
// linked back to the quote_requests row it came from), viewed as one
// aggregate: RFQ/quote -> purchase order/payment -> shipping/documents/
// inspection -> dispute -> communication timeline.

export async function getTradeCase(orderId, requester) {
  const orderRes = await query(
    `SELECT o.*, s.owner_id AS seller_id, s.name AS shop_name
     FROM orders o
     JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1`,
    [orderId]
  );
  const order = orderRes.rows[0];
  if (!order) return null;

  const isParty = requester.isAdmin
    || requester.id === order.buyer_id
    || requester.id === order.seller_id
    || requester.id === order.assigned_admin_id
    || requester.id === order.assigned_logistics_provider_id;
  if (!isParty) return { forbidden: true };

  const [quoteRes, paymentsRes, disputeRes, eventsRes] = await Promise.all([
    order.quote_request_id
      ? query(`SELECT id, quantity_requested, message, quoted_unit_price, quoted_notes, quoted_by, quoted_at, status
                FROM quote_requests WHERE id = $1`, [order.quote_request_id])
      : Promise.resolve({ rows: [] }),
    query(`SELECT id, method, amount, currency, status, created_at FROM payments WHERE order_id = $1 ORDER BY created_at`, [orderId]),
    query(`SELECT id, reason, status, resolution_notes, refund_amount, created_at FROM disputes WHERE order_id = $1`, [orderId]),
    query(
      `SELECT id, actor_id, event_type, message, is_admin_only, created_at
       FROM trade_case_events
       WHERE order_id = $1 ${requester.isAdmin ? '' : 'AND is_admin_only = FALSE'}
       ORDER BY created_at`,
      [orderId]
    )
  ]);

  return {
    order,
    quote: quoteRes.rows[0] || null,
    payments: paymentsRes.rows,
    dispute: disputeRes.rows[0] || null,
    events: eventsRes.rows
  };
}

export async function logTradeCaseEvent(orderId, actorId, eventType, message, isAdminOnly = false) {
  const { rows } = await query(
    `INSERT INTO trade_case_events (order_id, actor_id, event_type, message, is_admin_only)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orderId, actorId, eventType, message, isAdminOnly]
  );
  return rows[0];
}

// Admin-only: assign a trade case to a support/ops agent and/or a
// logistics provider. Either field can be cleared by passing null;
// omit a key entirely to leave that assignment untouched.
export async function assignTradeCase(orderId, { adminId, logisticsProviderId }, actingAdminId) {
  return withTransaction(async (client) => {
    const sets = [];
    const params = [];
    let i = 1;
    if (adminId !== undefined) { sets.push(`assigned_admin_id = $${i++}`); params.push(adminId); }
    if (logisticsProviderId !== undefined) { sets.push(`assigned_logistics_provider_id = $${i++}`); params.push(logisticsProviderId); }
    if (!sets.length) throw Object.assign(new Error('Nothing to assign.'), { status: 400 });

    params.push(orderId);
    const { rows } = await client.query(
      `UPDATE orders SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
      params
    );
    if (!rows[0]) throw Object.assign(new Error('Order not found.'), { status: 404 });

    const parts = [];
    if (adminId !== undefined) parts.push(`agent ${adminId ? adminId : 'unassigned'}`);
    if (logisticsProviderId !== undefined) parts.push(`logistics provider ${logisticsProviderId ? logisticsProviderId : 'unassigned'}`);
    await client.query(
      `INSERT INTO trade_case_events (order_id, actor_id, event_type, message, is_admin_only)
       VALUES ($1, $2, 'assignment', $3, TRUE)`,
      [orderId, actingAdminId, `Assigned: ${parts.join(', ')}`]
    );
    return rows[0];
  });
}
