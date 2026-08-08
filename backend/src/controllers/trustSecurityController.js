import { query, withTransaction } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';

async function notifyUser(userId, type, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

// ---------------------------------------------------------------------------
// DISPUTES — real case management. Previously 'disputed' was an order
// status nothing in the codebase ever set; this is what actually sets it,
// and gives both parties + admin a shared thread and evidence trail.
// ---------------------------------------------------------------------------

const VALID_REASONS = ['item_not_received', 'item_not_as_described', 'damaged', 'wrong_item', 'delivery_issue', 'payment_issue', 'other'];

export async function openDispute(req, res) {
  const { orderId, reason, description } = req.body;
  if (!orderId || !VALID_REASONS.includes(reason) || !description) {
    return res.status(400).json({ error: `orderId, a valid reason (${VALID_REASONS.join(', ')}), and description are required.` });
  }
  try {
    const result = await withTransaction(async (client) => {
      const orderResult = await client.query(
        `SELECT o.*, s.owner_id AS seller_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = $1 FOR UPDATE`,
        [orderId]
      );
      const order = orderResult.rows[0];
      if (!order) { const err = new Error('ORDER_NOT_FOUND'); err.code = 'ORDER_NOT_FOUND'; throw err; }
      if (order.buyer_id !== req.user.id && order.seller_id !== req.user.id) {
        const err = new Error('NOT_YOUR_ORDER'); err.code = 'NOT_YOUR_ORDER'; throw err;
      }

      let dispute;
      try {
        const inserted = await client.query(
          `INSERT INTO disputes (order_id, opened_by, reason, description) VALUES ($1,$2,$3,$4) RETURNING *`,
          [orderId, req.user.id, reason, description]
        );
        dispute = inserted.rows[0];
      } catch (e) {
        if (e.code === '23505') { const err = new Error('ALREADY_OPEN'); err.code = 'ALREADY_OPEN'; throw err; }
        throw e;
      }

      await client.query(`UPDATE orders SET status = 'disputed' WHERE id = $1`, [orderId]);
      return { dispute, order };
    });

    await logSecurityEvent(null, {
      actorId: req.user.id, actorRole: req.user.role, eventType: 'dispute_opened',
      entityType: 'dispute', entityId: result.dispute.id, metadata: { orderId, reason }
    });
    const otherParty = result.order.buyer_id === req.user.id ? result.order.seller_id : result.order.buyer_id;
    await notifyUser(otherParty, 'dispute_opened', 'A dispute was opened', `A dispute was opened on order ${orderId}.`, { disputeId: result.dispute.id });

    return res.status(201).json({ message: 'Dispute opened.', dispute: result.dispute });
  } catch (err) {
    if (err.code === 'ORDER_NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    if (err.code === 'NOT_YOUR_ORDER') return res.status(403).json({ error: 'You are not a party to this order.' });
    if (err.code === 'ALREADY_OPEN') return res.status(409).json({ error: 'A dispute already exists for this order.' });
    console.error('Open dispute error:', err);
    return res.status(500).json({ error: 'Could not open dispute.' });
  }
}

async function getDisputeIfParty(disputeId, user) {
  const result = await query(
    `SELECT d.*, o.buyer_id, s.owner_id AS seller_id
     FROM disputes d JOIN orders o ON o.id = d.order_id JOIN shops s ON s.id = o.shop_id
     WHERE d.id = $1`,
    [disputeId]
  );
  const dispute = result.rows[0];
  if (!dispute) return { dispute: null, isParty: false };
  const isParty = dispute.buyer_id === user.id || dispute.seller_id === user.id;
  return { dispute, isParty };
}

export async function getDispute(req, res) {
  const { id } = req.params;
  try {
    const { dispute, isParty } = await getDisputeIfParty(id, req.user);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
    if (!isParty && !req.user.isAdmin) return res.status(403).json({ error: 'Not your dispute.' });

    const messagesResult = await query(
      `SELECT dm.*, u.username AS sender_username FROM dispute_messages dm JOIN users u ON u.id = dm.sender_id
       WHERE dm.dispute_id = $1 AND ($2 OR is_admin_note = FALSE) ORDER BY dm.created_at ASC`,
      [id, req.user.isAdmin]
    );
    const evidenceResult = await query('SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at ASC', [id]);

    return res.json({ dispute, messages: messagesResult.rows, evidence: evidenceResult.rows });
  } catch (err) {
    console.error('Get dispute error:', err);
    return res.status(500).json({ error: 'Could not load dispute.' });
  }
}

export async function myDisputes(req, res) {
  try {
    const result = await query(
      `SELECT d.*, o.total_amount, o.currency, p.title AS product_title
       FROM disputes d JOIN orders o ON o.id = d.order_id JOIN products p ON p.id = o.product_id JOIN shops s ON s.id = o.shop_id
       WHERE o.buyer_id = $1 OR s.owner_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    return res.json({ disputes: result.rows });
  } catch (err) {
    console.error('My disputes error:', err);
    return res.status(500).json({ error: 'Could not load disputes.' });
  }
}

export async function addDisputeMessage(req, res) {
  const { id } = req.params;
  const { message, isAdminNote } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required.' });
  try {
    const { dispute, isParty } = await getDisputeIfParty(id, req.user);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
    if (!isParty && !req.user.isAdmin) return res.status(403).json({ error: 'Not your dispute.' });
    if (isAdminNote && !req.user.isAdmin) return res.status(403).json({ error: 'Only an admin can add an internal note.' });

    const result = await query(
      `INSERT INTO dispute_messages (dispute_id, sender_id, message, is_admin_note) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, req.user.id, message, Boolean(isAdminNote)]
    );
    if (!isAdminNote) {
      const otherParty = dispute.buyer_id === req.user.id ? dispute.seller_id : dispute.buyer_id;
      await notifyUser(otherParty, 'dispute_updated', 'New message on your dispute', message.slice(0, 140), { disputeId: id });
    }
    return res.status(201).json({ message: 'Message added.', disputeMessage: result.rows[0] });
  } catch (err) {
    console.error('Add dispute message error:', err);
    return res.status(500).json({ error: 'Could not add message.' });
  }
}

export async function addDisputeEvidence(req, res) {
  const { id } = req.params;
  const { fileUrl, caption } = req.body;
  if (!fileUrl) return res.status(400).json({ error: 'fileUrl is required.' });
  try {
    const { dispute, isParty } = await getDisputeIfParty(id, req.user);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
    if (!isParty && !req.user.isAdmin) return res.status(403).json({ error: 'Not your dispute.' });

    const result = await query(
      `INSERT INTO dispute_evidence (dispute_id, uploaded_by, file_url, caption) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, req.user.id, fileUrl, caption || null]
    );
    return res.status(201).json({ message: 'Evidence added.', evidence: result.rows[0] });
  } catch (err) {
    console.error('Add dispute evidence error:', err);
    return res.status(500).json({ error: 'Could not add evidence.' });
  }
}

// ---- Admin ----

export async function adminListDisputes(req, res) {
  const { status } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`d.status = $${i}`); values.push(status); i += 1; }
  try {
    const result = await query(
      `SELECT d.*, o.total_amount, o.currency, o.buyer_id, s.owner_id AS seller_id, p.title AS product_title
       FROM disputes d JOIN orders o ON o.id = d.order_id JOIN products p ON p.id = o.product_id JOIN shops s ON s.id = o.shop_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY d.created_at DESC`,
      values
    );
    return res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Admin list disputes error:', err);
    return res.status(500).json({ error: 'Could not load disputes.' });
  }
}

const RESOLUTION_STATUSES = ['under_review', 'resolved_refund', 'resolved_release', 'resolved_split', 'closed'];

export async function resolveDispute(req, res) {
  const { id } = req.params;
  const { status, resolutionNotes, refundAmount } = req.body;
  if (!RESOLUTION_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${RESOLUTION_STATUSES.join(', ')}` });
  try {
    const isFinal = ['resolved_refund', 'resolved_release', 'resolved_split', 'closed'].includes(status);
    const result = await query(
      `UPDATE disputes SET status = $1, resolution_notes = $2, refund_amount = $3,
         resolved_by = CASE WHEN $4 THEN $5 ELSE resolved_by END, resolved_at = CASE WHEN $4 THEN now() ELSE resolved_at END
       WHERE id = $6 RETURNING *`,
      [status, resolutionNotes || null, refundAmount ?? null, isFinal, req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Dispute not found.' });
    const dispute = result.rows[0];

    // Once resolved (not just under review), the order comes out of the
    // 'disputed' state. Actual fund movement (refund/release) is still done
    // via the existing admin-refund / release-funds endpoints in
    // ordersController.js — this only reflects the *decision*, so money
    // movement always goes through the one escrow-aware code path.
    if (isFinal && status !== 'closed') {
      await query(`UPDATE orders SET status = 'completed' WHERE id = $1 AND status = 'disputed'`, [dispute.order_id]);
    }

    await logSecurityEvent(null, {
      actorId: req.user.id, actorRole: 'admin', eventType: 'dispute_resolved',
      entityType: 'dispute', entityId: id, metadata: { status, resolutionNotes, refundAmount }
    });

    const buyerAndSeller = await query(
      `SELECT o.buyer_id, s.owner_id AS seller_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = $1`,
      [dispute.order_id]
    );
    const { buyer_id, seller_id } = buyerAndSeller.rows[0];
    for (const uid of [buyer_id, seller_id]) {
      await notifyUser(uid, 'dispute_updated', 'Dispute update', `Your dispute status is now "${status}".`, { disputeId: id });
    }

    return res.json({ message: 'Dispute updated.', dispute });
  } catch (err) {
    console.error('Resolve dispute error:', err);
    return res.status(500).json({ error: 'Could not resolve dispute.' });
  }
}

// ---------------------------------------------------------------------------
// FRAUD FLAGS — hand-raised by an admin, or written by an on-demand
// heuristic scan. Never auto-actioned; always lands in this review queue.
// ---------------------------------------------------------------------------

export async function listFraudFlags(req, res) {
  const { status } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`f.status = $${i}`); values.push(status); i += 1; }
  try {
    const result = await query(
      `SELECT f.*, u.username FROM fraud_flags f LEFT JOIN users u ON u.id = f.user_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY f.severity DESC, f.created_at DESC`,
      values
    );
    return res.json({ flags: result.rows });
  } catch (err) {
    console.error('List fraud flags error:', err);
    return res.status(500).json({ error: 'Could not load fraud flags.' });
  }
}

export async function reviewFraudFlag(req, res) {
  const { id } = req.params;
  const { status, reviewNotes } = req.body;
  if (!['reviewing', 'confirmed', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  try {
    const result = await query(
      `UPDATE fraud_flags SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $4 RETURNING *`,
      [status, reviewNotes || null, req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Fraud flag not found.' });
    return res.json({ message: 'Fraud flag updated.', flag: result.rows[0] });
  } catch (err) {
    console.error('Review fraud flag error:', err);
    return res.status(500).json({ error: 'Could not update fraud flag.' });
  }
}

export async function createFraudFlag(req, res) {
  const { userId, orderId, flagType, severity, details } = req.body;
  if (!flagType) return res.status(400).json({ error: 'flagType is required.' });
  try {
    const result = await query(
      `INSERT INTO fraud_flags (user_id, order_id, flag_type, severity, details) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId || null, orderId || null, flagType, severity || 1, JSON.stringify(details || {})]
    );
    return res.status(201).json({ message: 'Fraud flag created.', flag: result.rows[0] });
  } catch (err) {
    console.error('Create fraud flag error:', err);
    return res.status(500).json({ error: 'Could not create fraud flag.' });
  }
}

// On-demand heuristic scan (admin-triggered — there is no cron in this
// environment). Three simple, explainable signals; anything it finds still
// lands in the same review queue as a hand-raised flag, never auto-actioned.
export async function runFraudScan(req, res) {
  try {
    const created = [];

    // 1. Rapid cancellations — 3+ cancelled orders by the same buyer in the
    // last 24 hours.
    const rapidCancellations = await query(
      `SELECT buyer_id, COUNT(*) AS cnt FROM orders
       WHERE status = 'cancelled' AND cancelled_at > now() - interval '24 hours'
       GROUP BY buyer_id HAVING COUNT(*) >= 3`
    );
    for (const row of rapidCancellations.rows) {
      const exists = await query(
        `SELECT id FROM fraud_flags WHERE user_id = $1 AND flag_type = 'rapid_cancellations' AND status = 'open' AND created_at > now() - interval '24 hours'`,
        [row.buyer_id]
      );
      if (exists.rows.length > 0) continue;
      const inserted = await query(
        `INSERT INTO fraud_flags (user_id, flag_type, severity, details, auto_detected)
         VALUES ($1,'rapid_cancellations',3,$2,TRUE) RETURNING *`,
        [row.buyer_id, JSON.stringify({ cancelledIn24h: Number(row.cnt) })]
      );
      created.push(inserted.rows[0]);
    }

    // 2. High dispute ratio — 3+ orders and disputes on at least 30% of them.
    const disputeRatio = await query(
      `SELECT o.buyer_id, COUNT(*) AS total_orders, COUNT(d.id) AS disputed_orders
       FROM orders o LEFT JOIN disputes d ON d.order_id = o.id
       GROUP BY o.buyer_id HAVING COUNT(*) >= 3 AND COUNT(d.id)::float / COUNT(*) >= 0.3`
    );
    for (const row of disputeRatio.rows) {
      const exists = await query(
        `SELECT id FROM fraud_flags WHERE user_id = $1 AND flag_type = 'high_dispute_ratio' AND status = 'open'`,
        [row.buyer_id]
      );
      if (exists.rows.length > 0) continue;
      const inserted = await query(
        `INSERT INTO fraud_flags (user_id, flag_type, severity, details, auto_detected)
         VALUES ($1,'high_dispute_ratio',4,$2,TRUE) RETURNING *`,
        [row.buyer_id, JSON.stringify({ totalOrders: Number(row.total_orders), disputedOrders: Number(row.disputed_orders) })]
      );
      created.push(inserted.rows[0]);
    }

    // 3. Unusual login pattern — 5+ failed logins for the same email in the
    // last hour (credential-stuffing signal), flagged against that user
    // account if one exists with that email.
    const failedLogins = await query(
      `SELECT email, COUNT(*) AS cnt FROM login_attempts
       WHERE success = FALSE AND created_at > now() - interval '1 hour'
       GROUP BY email HAVING COUNT(*) >= 5`
    );
    for (const row of failedLogins.rows) {
      const userResult = await query('SELECT id FROM users WHERE email = $1', [row.email]);
      const userId = userResult.rows[0]?.id || null;
      const exists = await query(
        `SELECT id FROM fraud_flags WHERE flag_type = 'unusual_login_pattern' AND status = 'open'
         AND details->>'email' = $1 AND created_at > now() - interval '1 hour'`,
        [row.email]
      );
      if (exists.rows.length > 0) continue;
      const inserted = await query(
        `INSERT INTO fraud_flags (user_id, flag_type, severity, details, auto_detected)
         VALUES ($1,'unusual_login_pattern',3,$2,TRUE) RETURNING *`,
        [userId, JSON.stringify({ email: row.email, failedAttemptsLastHour: Number(row.cnt) })]
      );
      created.push(inserted.rows[0]);
    }

    return res.json({ message: `Scan complete. ${created.length} new flag(s) raised.`, flags: created });
  } catch (err) {
    console.error('Run fraud scan error:', err);
    return res.status(500).json({ error: 'Could not run fraud scan.' });
  }
}

// ---------------------------------------------------------------------------
// UNIFIED SECURITY TIMELINE — joins platform_security_log with the tables
// that already track their own events (logins, orders, payments,
// deliveries, dropship partnership approvals) rather than duplicating them.
// ---------------------------------------------------------------------------

export async function userSecurityTimeline(req, res) {
  const { userId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  try {
    const userResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const [securityLog, logins, orders, payments, deliveries, dropshipLog, disputes] = await Promise.all([
      query(`SELECT event_type AS type, entity_type, entity_id, metadata, created_at FROM platform_security_log WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 
$2`, [userId, limit]),
      query(`SELECT success, ip_address, created_at FROM login_attempts WHERE email = $1 ORDER BY created_at DESC LIMIT $2`, [user.email, limit]),
      query(`SELECT id, status, total_amount, currency, created_at FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]),
      query(`SELECT p.id, p.status, p.amount, p.currency, p.created_at FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.buyer_id = $1 ORDER BY 
p.created_at DESC LIMIT $2`, [userId, limit]),
      query(`SELECT d.id, d.status, d.created_at FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE o.buyer_id = $1 ORDER BY d.created_at DESC LIMIT $2`, 
[userId, limit]),
      query(`SELECT action AS type, entity_type, entity_id, metadata, created_at FROM dropship_audit_log WHERE actor_id = $1 ORDER BY created_at DESC LIMIT $2`, 
[userId, limit]),
      query(`SELECT d.id, d.status, d.reason, d.created_at FROM disputes d JOIN orders o ON o.id = d.order_id WHERE o.buyer_id = $1 OR d.opened_by = $1 ORDER BY 
d.created_at DESC LIMIT $2`, [userId, userId, limit])
    ]);

    return res.json({
      securityLog: securityLog.rows,
      loginActivity: logins.rows,
      orderHistory: orders.rows,
      paymentActivity: payments.rows,
      deliveryHistory: deliveries.rows,
      partnershipActivity: dropshipLog.rows,
      disputeHistory: disputes.rows
    });
  } catch (err) {
    console.error('User security timeline error:', err);
    return res.status(500).json({ error: 'Could not load security timeline.' });
  }
}
