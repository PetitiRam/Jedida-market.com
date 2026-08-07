import { query, withTransaction } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';

async function logWalletTransaction(client, { walletId, direction, amount, balanceAfter, referenceType, referenceId, note, createdBy }) {
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [walletId, direction, amount, balanceAfter, referenceType, referenceId || null, note || null, createdBy || null]
  );
}

export async function myWallet(req, res) {
  try {
    const result = await query(`SELECT * FROM wallets WHERE owner_id = $1 AND type = 'user'`, [req.user.id]);
    const wallet = result.rows[0] || null;
    if (!wallet) return res.json({ wallet: null });

    // "Pending release" — funds still sitting in escrow for this seller's
    // orders that are completed (all parties confirmed) but not yet paid
    // out by admin. Computed rather than stored so it's always exactly
    // in sync with the orders table it's derived from.
    const pendingRelease = await query(
      `SELECT COALESCE(SUM(o.total_amount - o.platform_fee_amount), 0) AS amount
       FROM orders o JOIN shops s ON s.id = o.shop_id
       WHERE s.owner_id = $1 AND o.status = 'completed' AND o.funds_released_at IS NULL`,
      [req.user.id]
    );

    return res.json({
      wallet: {
        ...wallet,
        availableBalance: Number(wallet.balance),
        pendingWithdrawal: Number(wallet.pending_withdrawal || 0),
        pendingRelease: Number(pendingRelease.rows[0].amount),
      }
    });
  } catch (err) {
    console.error('My wallet error:', err);
    return res.status(500).json({ error: 'Could not load wallet.' });
  }
}

export async function myWalletTransactions(req, res) {
  try {
    const walletResult = await query(`SELECT id FROM wallets WHERE owner_id = $1 AND type = 'user'`, [req.user.id]);
    const wallet = walletResult.rows[0];
    if (!wallet) return res.json({ transactions: [], total: 0, page: 1, pageSize: 20 });

    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * pageSize;

    const [result, countResult] = await Promise.all([
      query(
        `SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [wallet.id, pageSize, offset]
      ),
      query(`SELECT COUNT(*) FROM wallet_transactions WHERE wallet_id = $1`, [wallet.id])
    ]);
    return res.json({ transactions: result.rows, total: Number(countResult.rows[0].count), page, pageSize });
  } catch (err) {
    console.error('My wallet transactions error:', err);
    return res.status(500).json({ error: 'Could not load wallet transactions.' });
  }
}

export async function platformWallets(req, res) {
  try {
    const result = await query(`SELECT * FROM wallets WHERE type IN ('platform','escrow')`);
    const pendingRelease = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS amount FROM orders WHERE status = 'completed' AND funds_released_at IS NULL`
    );
    return res.json({ wallets: result.rows, escrowPendingRelease: Number(pendingRelease.rows[0].amount) });
  } catch (err) {
    console.error('Platform wallets error:', err);
    return res.status(500).json({ error: 'Could not load platform wallets.' });
  }
}

// Sellers/delivery partners can sell/deliver immediately after their role is
// approved, but withdrawing their earnings requires an approved KYC —
// enforced here, not just hinted at in the UI.
export async function requestWithdrawal(req, res) {
  const { amount, method, destination } = req.body;
  const numericAmount = Number(amount);
  if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0 || !method) {
    return res.status(400).json({ error: 'A valid amount and payout method are required.' });
  }
  if (!['stripe', 'flutterwave', 'dpo', 'coinbase', 'wallet'].includes(method)) {
    return res.status(400).json({ error: 'Unsupported payout method.' });
  }

  try {
    // A double-tapped "Withdraw" (or a retried request after a slow/timed-out
    // response) within the same window gets the just-created request handed
    // back instead of creating a second one — same pattern as createOrder's
    // duplicate-checkout guard. Without this, each request is individually
    // balance-safe (the atomic UPDATE below can't overdraw), but a user can
    // still end up with two separate legitimate-looking payout requests for
    // one intended action.
    const inFlight = await query(
      `SELECT * FROM withdrawal_requests WHERE user_id = $1 AND amount = $2 AND method = $3
         AND status = 'pending' AND created_at > now() - interval '10 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, numericAmount, method]
    );
    if (inFlight.rows.length > 0) {
      return res.status(200).json({ message: 'Withdrawal request already submitted for admin review.', withdrawal: inFlight.rows[0] });
    }

    const userResult = await query('SELECT kyc_status, primary_role FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];

    if (user.primary_role === 'buyer') {
      return res.status(403).json({ error: 'Only sellers and delivery partners can withdraw funds.' });
    }
    if (user.kyc_status !== 'approved') {
      return res.status(403).json({
        error: 'Complete KYC verification before withdrawing funds.',
        kycStatus: user.kyc_status
      });
    }

    // Flag unusually large requests for admin attention without blocking
    // them — a simple, explainable signal rather than an opaque score.
    const historyResult = await query(
      `SELECT COALESCE(AVG(amount), 0) AS avg_amount FROM withdrawal_requests WHERE user_id = $1 AND status = 'paid'`,
      [req.user.id]
    );
    const avgPast = Number(historyResult.rows[0].avg_amount);
    const flaggedReason = (avgPast > 0 && numericAmount > avgPast * 5)
      ? `Amount is ${(numericAmount / avgPast).toFixed(1)}x this user's average past payout.`
      : null;

    // Hold the funds and create the request atomically, in one transaction,
    // with the balance check happening as part of the same guarded UPDATE
    // that moves the money — not a separate SELECT beforehand — so two
    // concurrent withdrawal requests can't both pass the check and both
    // deduct (the classic double-withdrawal / race-condition bug).
    const withdrawal = await withTransaction(async (client) => {
      const held = await client.query(
        `UPDATE wallets
         SET balance = balance - $1, pending_withdrawal = pending_withdrawal + $1
         WHERE owner_id = $2 AND type = 'user' AND balance >= $1
         RETURNING *`,
        [numericAmount, req.user.id]
      );
      if (held.rows.length === 0) {
        const err = new Error('INSUFFICIENT_FUNDS');
        err.code = 'INSUFFICIENT_FUNDS';
        throw err;
      }
      const wallet = held.rows[0];

      const inserted = await client.query(
        `INSERT INTO withdrawal_requests (user_id, amount, currency, method, destination, flagged_reason)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.id, numericAmount, wallet.currency, method, destination || null, flaggedReason]
      );

      await logWalletTransaction(client, {
        walletId: wallet.id, direction: 'debit', amount: numericAmount, balanceAfter: wallet.balance,
        referenceType: 'withdrawal_hold', referenceId: inserted.rows[0].id,
        note: 'Funds held pending withdrawal review', createdBy: req.user.id
      });

      await logSecurityEvent(client, {
        actorId: req.user.id, actorRole: user.primary_role,
        eventType: 'withdrawal_requested', entityType: 'withdrawal_request', entityId: inserted.rows[0].id,
        metadata: { amount: numericAmount, method, flaggedReason, ip: req.ip },
      });

      return inserted.rows[0];
    });

    return res.status(201).json({ message: 'Withdrawal request submitted for admin review.', withdrawal });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_FUNDS') {
      return res.status(400).json({ error: 'Insufficient wallet balance for this withdrawal.' });
    }
    console.error('Request withdrawal error:', err);
    return res.status(500).json({ error: 'Could not submit withdrawal request.' });
  }
}

export async function myWithdrawals(req, res) {
  const result = await query('SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ withdrawals: result.rows });
}

// ===== Admin =====
export async function listWithdrawals(req, res) {
  const { status } = req.query;
  const where = status ? 'WHERE w.status = $1' : '';
  const values = status ? [status] : [];
  const result = await query(
    `SELECT w.*, u.full_name, u.email FROM withdrawal_requests w JOIN users u ON u.id = w.user_id
     ${where} ORDER BY w.created_at DESC LIMIT 200`,
    values
  );
  res.json({ withdrawals: result.rows });
}

export async function reviewWithdrawal(req, res) {
  const { id } = req.params;
  const { decision } = req.body; // 'approve' | 'reject'
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
  }

  try {
    const outcome = await withTransaction(async (client) => {
      // Idempotency guard: the status flip only succeeds once, atomically —
      // a second admin double-clicking "approve" (or two requests racing)
      // gets rowCount 0 on their attempt instead of paying out twice.
      const newStatus = decision === 'approve' ? 'paid' : 'rejected';
      const flipped = await client.query(
        `UPDATE withdrawal_requests SET status = $1, reviewed_by = $2, reviewed_at = now()
         WHERE id = $3 AND status = 'pending' RETURNING *`,
        [newStatus, req.user.id, id]
      );
      if (flipped.rows.length === 0) {
        const err = new Error('ALREADY_REVIEWED');
        err.code = 'ALREADY_REVIEWED';
        throw err;
      }
      const withdrawal = flipped.rows[0];

      if (decision === 'approve') {
        const wallet = await client.query(
          `UPDATE wallets SET pending_withdrawal = pending_withdrawal - $1
           WHERE owner_id = $2 AND type = 'user' RETURNING *`,
          [withdrawal.amount, withdrawal.user_id]
        );
        await logWalletTransaction(client, {
          walletId: wallet.rows[0].id, direction: 'debit', amount: withdrawal.amount, balanceAfter: wallet.rows[0].balance,
          referenceType: 'withdrawal_paid', referenceId: withdrawal.id, note: 'Withdrawal paid out', createdBy: req.user.id
        });
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'payout_released','Withdrawal paid out',$2,$3)`,
          [withdrawal.user_id, `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} has been paid out.`, req.user.id]
        );
      } else {
        // refund the held balance back to the wallet
        const wallet = await client.query(
          `UPDATE wallets SET balance = balance + $1, pending_withdrawal = pending_withdrawal - $1
           WHERE owner_id = $2 AND type = 'user' RETURNING *`,
          [withdrawal.amount, withdrawal.user_id]
        );
        await logWalletTransaction(client, {
          walletId: wallet.rows[0].id, direction: 'credit', amount: withdrawal.amount, balanceAfter: wallet.rows[0].balance,
          referenceType: 'withdrawal_refund', referenceId: withdrawal.id, note: 'Withdrawal declined — funds returned', createdBy: req.user.id
        });
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'system_announcement','Withdrawal declined',$2,$3)`,
          [withdrawal.user_id, `Your withdrawal request was declined and the funds were returned to your wallet.`, req.user.id]
        );
      }

      await logSecurityEvent(client, {
        actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
        eventType: decision === 'approve' ? 'withdrawal_approved' : 'withdrawal_rejected',
        entityType: 'withdrawal_request', entityId: withdrawal.id,
        metadata: { userId: withdrawal.user_id, amount: withdrawal.amount, currency: withdrawal.currency, ip: req.ip },
      });

      return newStatus;
    });

    return res.json({ message: `Withdrawal ${outcome === 'paid' ? 'paid out' : 'rejected'}.` });
  } catch (err) {
    if (err.code === 'ALREADY_REVIEWED') {
      return res.status(409).json({ error: 'This request has already been reviewed.' });
    }
    console.error('Review withdrawal error:', err);
    return res.status(500).json({ error: 'Could not process withdrawal review.' });
  }
}
