import { query, withTransaction } from "../config/db.js";
import { logSecurityEvent } from "../services/securityLogService.js";

async function logWalletTransaction(client, { walletId, direction, amount, balanceAfter, referenceType, referenceId, note, createdBy }) {
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [walletId, direction, amount, balanceAfter, referenceType, referenceId || null, note || null, createdBy || null]
  );
}

export async function getPendingPayments(req, res) {
  try {
    const result = await query(`
      SELECT
        p.id,
        p.order_id,
        p.amount,
        p.currency,
        p.method,
        p.transaction_reference,
        p.proof_image AS payment_proof,
        p.status,
        u.email AS buyer_name
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      JOIN users u ON u.id = o.buyer_id
      WHERE p.status IN ('pending', 'submitted')
      ORDER BY p.created_at DESC
    `);

    res.json({
      payments: result.rows
    });
  } catch (err) {
    console.error("Get pending payments error:", err);
    res.status(500).json({ error: "Could not load payments" });
  }
}

// Admin approves a manually-submitted (mobile money / bank transfer) proof
// of payment. This is the money-moving twin of confirmPayment() for card/
// provider checkouts, so it gets the same hardening:
//  - the payment row can only leave 'submitted' once, atomically — a
//    double-click, a retried request, or two admins racing on the same
//    payment all resolve to exactly one credit into escrow, not several.
//  - the order status flip is guarded the same way, so a payment that
//    somehow gets approved twice still can't push the order (and its
//    escrow credit) through this path a second time.
//  - every balance change is written to wallet_transactions and
//    escrow_ledger so the credit is traceable back to this exact approval.
export async function approvePayment(req, res) {
  const { paymentId } = req.params;

  try {
    const result = await withTransaction(async (client) => {
      const flipped = await client.query(
        `UPDATE payments SET status = 'succeeded'
         WHERE id = $1 AND status = 'submitted'
         RETURNING *`,
        [paymentId]
      );
      if (flipped.rows.length === 0) {
        const existing = await client.query('SELECT id, status FROM payments WHERE id = $1', [paymentId]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        const err = new Error('ALREADY_PROCESSED'); err.code = 'ALREADY_PROCESSED'; err.status = existing.rows[0].status; throw err;
      }
      const payment = flipped.rows[0];

      // Order status flip is guarded the same way as confirmPayment(): only
      // succeeds from pending_payment, so this can never double-credit
      // escrow for an order that was already moved into paid_escrow by
      // another payment record or another admin action.
      const settingsResult = await client.query('SELECT escrow_protection_days FROM platform_settings WHERE id = 1');
      const protectionDays = settingsResult.rows[0]?.escrow_protection_days ?? 7;

      const orderFlipped = await client.query(
        `UPDATE orders SET status = 'paid_escrow', protection_period_ends_at = now() + ($2 || ' days')::interval
         WHERE id = $1 AND status = 'pending_payment' RETURNING *`,
        [payment.order_id, protectionDays]
      );
      if (orderFlipped.rows.length === 0) {
        const err = new Error('ORDER_ALREADY_PROCESSED'); err.code = 'ORDER_ALREADY_PROCESSED'; throw err;
      }
      const order = orderFlipped.rows[0];

      const escrowWallet = await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE type = 'escrow' RETURNING *`,
        [payment.amount]
      );
      await logWalletTransaction(client, {
        walletId: escrowWallet.rows[0].id, direction: 'credit', amount: payment.amount, balanceAfter: escrowWallet.rows[0].balance,
        referenceType: 'order_escrow', referenceId: order.id,
        note: 'Manual payment verified by admin — held in escrow', createdBy: req.user.id
      });
      await client.query(
        `INSERT INTO escrow_ledger (order_id, direction, amount, note, created_by) VALUES ($1,'in',$2,'Manual payment verified by admin',$3)`,
        [order.id, payment.amount, req.user.id]
      );
      await client.query(
        `UPDATE products SET quantity_available = quantity_available - $1, orders_count = orders_count + 1 WHERE id = $2`,
        [order.quantity, order.product_id]
      );

      const shopResult = await client.query('SELECT owner_id FROM shops WHERE id = $1', [order.shop_id]);
      if (shopResult.rows[0]) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'new_order','New order received','You have a new paid order waiting to be fulfilled.')`,
          [shopResult.rows[0].owner_id]
        );
      }
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'system_announcement','Payment verified',$2,$3)`,
        [order.buyer_id, 'Your payment was verified and your order is now being processed.', req.user.id]
      );

      await logSecurityEvent(client, {
        actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
        eventType: 'payment_approved', entityType: 'payment', entityId: payment.id,
        metadata: { orderId: order.id, amount: payment.amount, ip: req.ip },
      });

      return payment;
    });

    return res.json({ message: "Payment approved", payment: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Payment not found' });
    if (err.code === 'ALREADY_PROCESSED') {
      return res.status(409).json({ error: `This payment has already been ${err.status === 'succeeded' ? 'approved' : err.status}.` });
    }
    if (err.code === 'ORDER_ALREADY_PROCESSED') {
      return res.status(409).json({ error: 'The order for this payment has already moved past pending payment.' });
    }
    console.error("Approve payment error:", err);
    res.status(500).json({ error: "Approval failed" });
  }
}

export async function rejectPayment(req, res) {
  const { paymentId } = req.params;
  const { reason } = req.body;

  try {
    const result = await withTransaction(async (client) => {
      // Same single-use guard: a payment can only be rejected from
      // 'pending'/'submitted', so this can't fire twice or reject a
      // payment that was already approved (and already in escrow).
      const flipped = await client.query(
        `UPDATE payments SET status = 'rejected'
         WHERE id = $1 AND status IN ('pending', 'submitted')
         RETURNING *`,
        [paymentId]
      );
      if (flipped.rows.length === 0) {
        const existing = await client.query('SELECT id, status FROM payments WHERE id = $1', [paymentId]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        const err = new Error('ALREADY_PROCESSED'); err.code = 'ALREADY_PROCESSED'; err.status = existing.rows[0].status; throw err;
      }
      const payment = flipped.rows[0];

      const order = await client.query('SELECT * FROM orders WHERE id = $1', [payment.order_id]);
      if (order.rows[0] && order.rows[0].status === 'pending_payment') {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'system_announcement','Payment rejected',$2,$3)`,
          [order.rows[0].buyer_id, reason ? `Your payment proof was rejected: ${reason}` : 'Your payment proof was rejected. Please resubmit.', req.user.id]
        );
      }

      await logSecurityEvent(client, {
        actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
        eventType: 'payment_rejected', entityType: 'payment', entityId: payment.id,
        metadata: { orderId: payment.order_id, amount: payment.amount, reason: reason || null, ip: req.ip },
      });

      return payment;
    });

    return res.json({ message: "Payment rejected", payment: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Payment not found' });
    if (err.code === 'ALREADY_PROCESSED') {
      return res.status(409).json({ error: `This payment has already been ${err.status}.` });
    }
    console.error("Reject payment error:", err);
    res.status(500).json({ error: "Could not reject payment" });
  }
}
