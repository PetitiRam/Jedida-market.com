import { query, withTransaction } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';
import { postTransaction, updateTransactionStatus } from '../services/ledgerService.js';
import { initiatePlatformPayment } from '../services/providerAbstraction.js';

async function logWalletTransaction(client, { walletId, direction, amount, balanceAfter, referenceType, referenceId, note, createdBy }) {
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [walletId, direction, amount, balanceAfter, referenceType, referenceId || null, note || null, createdBy || null]
  );
}

async function getWalletFeeSettings() {
  const result = await query('SELECT wallet_fee_settings FROM platform_settings WHERE id = 1');
  return result.rows[0]?.wallet_fee_settings || { depositFeePercent: 0, withdrawalFeePercent: 1.5, transferFeePercent: 0, transferFeeFlat: 0 };
}

// GET /api/wallet/fees/preview?type=withdrawal|deposit|transfer&amount=
// The "don't hide fees until after submission" endpoint (spec #36/#38) —
// the exact same getWalletFeeSettings() + math the real request handlers
// below use, so what's previewed here can never drift from what's
// actually charged.
export async function previewWalletFee(req, res) {
  try {
    const { type = 'withdrawal', amount } = req.query;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'A valid amount is required.' });
    }
    const settings = await getWalletFeeSettings();
    let feeAmount = 0;
    if (type === 'withdrawal') feeAmount = numericAmount * (settings.withdrawalFeePercent / 100);
    else if (type === 'deposit') feeAmount = numericAmount * (settings.depositFeePercent / 100);
    else if (type === 'transfer') feeAmount = numericAmount * (settings.transferFeePercent / 100) + Number(settings.transferFeeFlat || 0);
    else return res.status(400).json({ error: 'type must be withdrawal, deposit, or transfer.' });

    feeAmount = Math.round(feeAmount * 100) / 100;
    res.json({ amount: numericAmount, feeAmount, netAmount: Math.round((numericAmount - feeAmount) * 100) / 100 });
  } catch (err) {
    console.error('previewWalletFee failed:', err);
    res.status(500).json({ error: 'Could not calculate fee.' });
  }
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

// ===== Deposit =====
// Called by ordersController.createOrder() for method='wallet'. Atomic
// guarded debit — same shape as requestWithdrawal's balance hold (a
// single UPDATE with `balance >= amount` in the WHERE clause, so it can
// never overdraw and two concurrent wallet-paid checkouts can't both
// pass). Deliberately does NOT touch escrow/order status itself — the
// caller runs this first, and only if it succeeds calls the existing
// applyPaymentConfirmation() to do the rest (escrow credit, ledger,
// stock decrement, seller notification), so wallet-paid orders end up in
// exactly the same state as any other confirmed payment instead of a
// parallel, easier-to-drift copy of that logic.
export async function payForOrder(userId, referenceId, amount, currency, referenceType = 'order_payment') {
  return withTransaction(async (client) => {
    const debited = await client.query(
      `UPDATE wallets SET balance = balance - $1
       WHERE owner_id = $2 AND type = 'user' AND balance >= $1 RETURNING *`,
      [amount, userId]
    );
    if (debited.rows.length === 0) {
      const err = new Error('INSUFFICIENT_FUNDS'); err.code = 'INSUFFICIENT_FUNDS'; throw err;
    }
    const wallet = debited.rows[0];
    await logWalletTransaction(client, {
      walletId: wallet.id, direction: 'debit', amount, balanceAfter: wallet.balance,
      referenceType, referenceId,
      note: referenceType === 'cart_checkout_payment' ? `Wallet payment for cart checkout ${referenceId}` : `Wallet payment for order ${referenceId}`,
      createdBy: userId
    });
    return wallet;
  });
}

// GET /api/wallet/deposit-methods
// Platform-level methods (no shop involved) — mirrors
// providerAbstraction.getSellerEnabledMethods but for
// initiatePlatformPayment's global lookup instead of a per-shop one.
export async function listDepositMethods(req, res) {
  try {
    const result = await query(
      `SELECT pm.code, pm.name, pm.requires_fields, pr.code AS provider_code, pr.name AS provider_name
       FROM provider_methods pm
       JOIN provider_registry pr ON pr.id = pm.provider_id AND pr.status = 'active'
       WHERE pm.is_active = TRUE
       ORDER BY pm.display_order, pm.name`
    );
    res.json({ methods: result.rows });
  } catch (err) {
    console.error('listDepositMethods failed:', err);
    res.status(500).json({ error: 'Could not load deposit methods.' });
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

    // Previously buyers were blocked from withdrawing at all — a leftover
    // from when wallets only existed for sellers/delivery partners. Now
    // that buyers have a real wallet (deposits, transfers, refunds can all
    // land in it — spec #33), the actual protection that matters is KYC,
    // not role. Kept as one explicit removed check rather than silently
    // dropped, so this is easy to find and reconsider on review.
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
    const feeSettings = await getWalletFeeSettings();
    const feeAmount = Math.round(numericAmount * (feeSettings.withdrawalFeePercent / 100) * 100) / 100;
    const netAmount = numericAmount - feeAmount;

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
        `INSERT INTO withdrawal_requests (user_id, amount, currency, method, destination, flagged_reason, fee_amount, net_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.id, numericAmount, wallet.currency, method, destination || null, flaggedReason, feeAmount, netAmount]
      );

      await logWalletTransaction(client, {
        walletId: wallet.id, direction: 'debit', amount: numericAmount, balanceAfter: wallet.balance,
        referenceType: 'withdrawal_hold', referenceId: inserted.rows[0].id,
        note: 'Funds held pending withdrawal review', createdBy: req.user.id
      });

      await postTransaction(client, {
        idempotencyKey: `withdrawal_request:${inserted.rows[0].id}`,
        transactionType: 'withdrawal',
        status: 'pending',
        source: 'wallet',
        amount: numericAmount,
        feeAmount,
        netAmount,
        currency: wallet.currency,
        buyerId: user.primary_role === 'buyer' ? req.user.id : null,
        sellerId: user.primary_role !== 'buyer' ? req.user.id : null,
        actorId: req.user.id,
        sourceWalletId: wallet.id,
        paymentMethod: method,
        metadata: { destination, withdrawalRequestId: inserted.rows[0].id },
        createdBy: req.user.id,
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
        await updateTransactionStatus(client, {
          transactionId: (await client.query('SELECT id FROM financial_transactions WHERE idempotency_key = $1', [`withdrawal_request:${withdrawal.id}`])).rows[0]?.id,
          newStatus: 'succeeded', reason: 'Withdrawal approved and paid out', actorId: req.user.id,
        }).catch(() => {}); // pre-phase-100 withdrawals have no matching ledger row — nothing to update, not an error
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
        await updateTransactionStatus(client, {
          transactionId: (await client.query('SELECT id FROM financial_transactions WHERE idempotency_key = $1', [`withdrawal_request:${withdrawal.id}`])).rows[0]?.id,
          newStatus: 'reversed', reason: 'Withdrawal declined by admin', actorId: req.user.id,
        }).catch(() => {});
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

// ===== DEPOSITS (spec #35) =====

// POST /api/wallet/deposits  { methodCode, amount, fields? }
// methodCode comes from the same providerAbstraction catalog POS/checkout
// read (phase 96) — dynamically whatever the platform has integrated, not
// a hard-coded MTN/Airtel pair.
export async function createDeposit(req, res) {
  const { methodCode, amount, fields = {}, idempotencyKey: clientIdempotencyKey } = req.body;
  const numericAmount = Number(amount);
  if (!methodCode || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'A valid amount and methodCode are required.' });
  }
  if (!clientIdempotencyKey) {
    return res.status(400).json({ error: 'Missing idempotency key.' });
  }
  try {
    // A retried/double-tapped "Deposit" must not charge the provider
    // twice. The original server-generated `deposit:${userId}:${Date.now()}`
    // key here didn't actually protect against that -- two rapid
    // submissions get two different millisecond timestamps, so the UNIQUE
    // constraint never catches the duplicate. Requiring the caller to
    // supply (and reuse, on retry) the same key -- same pattern as the
    // wallet transfer below -- means a genuine retry hits this check
    // BEFORE the payment adapter is called a second time.
    const existingDeposit = await query('SELECT * FROM wallet_deposits WHERE user_id = $1 AND idempotency_key = $2', [req.user.id, clientIdempotencyKey]);
    if (existingDeposit.rows.length > 0) {
      return res.status(200).json({ message: 'Deposit already started.', deposit: existingDeposit.rows[0] });
    }

    const walletResult = await query(`SELECT * FROM wallets WHERE owner_id = $1 AND type = 'user'`, [req.user.id]);
    const wallet = walletResult.rows[0];
    if (!wallet) return res.status(404).json({ error: 'Wallet not found.' });

    const feeSettings = await getWalletFeeSettings();
    const feeAmount = Math.round(numericAmount * (feeSettings.depositFeePercent / 100) * 100) / 100;
    const netAmount = numericAmount - feeAmount;

    // Wallet deposits are user->platform, not user->seller — there's no
    // shop to scope method-activation against, so this uses the
    // platform-level lookup (any globally active provider method) rather
    // than providerAbstraction.initiatePayment(), which requires a shop.
    let initiation;
    try {
      initiation = await initiatePlatformPayment({ methodCode, amount: numericAmount, currency: wallet.currency, orderId: null, fields });
    } catch (initErr) {
      if (initErr.code === 'METHOD_NOT_ENABLED' || initErr.code === 'MISSING_FIELDS' || initErr.code === 'ADAPTER_NOT_IMPLEMENTED') {
        return res.status(400).json({ error: initErr.message || 'This deposit method is not available.' });
      }
      throw initErr;
    }

    const deposit = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO wallet_deposits (user_id, wallet_id, amount, fee_amount, net_amount, currency, method_code, provider_code, provider_reference, status, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10) RETURNING *`,
        [req.user.id, wallet.id, numericAmount, feeAmount, netAmount, wallet.currency, methodCode, initiation.providerCode, initiation.providerReference, clientIdempotencyKey]
      );
      await postTransaction(client, {
        idempotencyKey: `wallet_deposit:${inserted.rows[0].id}`,
        transactionType: 'deposit',
        status: 'pending',
        source: 'wallet',
        amount: numericAmount,
        feeAmount,
        netAmount,
        currency: wallet.currency,
        buyerId: req.user.id,
        actorId: req.user.id,
        destinationWalletId: wallet.id,
        paymentMethod: methodCode,
        providerCode: initiation.providerCode,
        providerReference: initiation.providerReference,
        metadata: { depositId: inserted.rows[0].id },
        createdBy: req.user.id,
      });
      return inserted.rows[0];
    });

    res.status(201).json({ deposit, checkoutUrl: initiation.checkoutUrl || null });
  } catch (err) {
    console.error('createDeposit failed:', err);
    res.status(500).json({ error: 'Could not start this deposit.' });
  }
}

// POST /api/wallet/deposits/:id/confirm
// Sandbox-only manual confirmation, mirroring confirmPayment() in
// ordersController.js exactly — for a live provider reference, funds are
// only credited once the provider's own webhook confirms it (spec #31:
// "never mark a payment successful solely because the frontend says
// so"). This endpoint refuses to run for anything that doesn't carry a
// sandbox reference, same guard as order payment confirmation.
export async function confirmDeposit(req, res) {
  try {
    const depositResult = await query('SELECT * FROM wallet_deposits WHERE id = $1', [req.params.id]);
    const deposit = depositResult.rows[0];
    if (!deposit) return res.status(404).json({ error: 'Deposit not found.' });
    if (deposit.user_id !== req.user.id) return res.status(403).json({ error: 'You can only confirm your own deposit.' });
    if (!/-SANDBOX-/.test(deposit.provider_reference || '')) {
      return res.status(403).json({ error: 'This deposit was charged through a live payment provider. Confirmation must come from the provider, not this endpoint.' });
    }

    const result = await withTransaction(async (client) => {
      const flipped = await client.query(
        `UPDATE wallet_deposits SET status = 'succeeded' WHERE id = $1 AND status = 'pending' RETURNING *`,
        [deposit.id]
      );
      if (flipped.rows.length === 0) {
        const err = new Error('ALREADY_PROCESSED'); err.code = 'ALREADY_PROCESSED'; throw err;
      }
      const walletResult = await client.query('SELECT * FROM wallets WHERE id = $1 FOR UPDATE', [deposit.wallet_id]);
      const wallet = walletResult.rows[0];
      const newBalance = Number(wallet.balance) + Number(deposit.net_amount);
      await client.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newBalance, wallet.id]);
      await logWalletTransaction(client, {
        walletId: wallet.id, direction: 'credit', amount: deposit.net_amount, balanceAfter: newBalance,
        referenceType: 'deposit', referenceId: deposit.id, note: 'Wallet deposit', createdBy: req.user.id,
      });
      const ledgerRow = await client.query('SELECT id FROM financial_transactions WHERE idempotency_key = $1', [`wallet_deposit:${deposit.id}`]);
      if (ledgerRow.rows[0]) {
        await updateTransactionStatus(client, { transactionId: ledgerRow.rows[0].id, newStatus: 'succeeded', actorId: req.user.id });
      }
      return flipped.rows[0];
    });

    res.json({ message: 'Deposit confirmed.', deposit: result });
  } catch (err) {
    if (err.code === 'ALREADY_PROCESSED') return res.status(409).json({ error: 'This deposit has already been processed.' });
    console.error('confirmDeposit failed:', err);
    res.status(500).json({ error: 'Could not confirm this deposit.' });
  }
}

// GET /api/wallet/deposits/mine
export async function myDeposits(req, res) {
  try {
    const result = await query('SELECT * FROM wallet_deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json({ deposits: result.rows });
  } catch (err) {
    console.error('myDeposits failed:', err);
    res.status(500).json({ error: 'Could not load your deposits.' });
  }
}

// ===== TRANSFERS (spec #37) =====

// POST /api/wallet/transfers  { recipientEmail | recipientPhone, amount, note? }
// Instant, atomic, wallet-to-wallet — no provider involved, so this
// completes synchronously rather than going through initiatePayment.
export async function createTransfer(req, res) {
  const { recipientEmail, recipientPhone, amount, note, idempotencyKey: clientIdempotencyKey } = req.body;
  const numericAmount = Number(amount);
  if ((!recipientEmail && !recipientPhone) || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'A recipient (email or phone) and a valid amount are required.' });
  }
  if (!clientIdempotencyKey) {
    return res.status(400).json({ error: 'Missing idempotency key.' });
  }
  try {
    // Same fix as createDeposit above: the original server-generated
    // `transfer:${fromId}:${toId}:${Date.now()}` key doesn't protect a
    // genuine double-submit (two rapid "Send" taps get two different
    // timestamps, so both debit the sender). Require the caller to supply
    // one key per Send action and check it before moving any money.
    const existingTransfer = await query('SELECT * FROM wallet_transfers WHERE from_user_id = $1 AND idempotency_key = $2', [req.user.id, clientIdempotencyKey]);
    if (existingTransfer.rows.length > 0) {
      return res.status(200).json({ message: 'Transfer already completed.', transfer: existingTransfer.rows[0] });
    }

    const senderResult = await query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const senderName = senderResult.rows[0]?.full_name || 'a JEDIDA user';
    const recipientResult = await query(
      `SELECT id, full_name FROM users WHERE ${recipientEmail ? 'email = $1' : 'phone_number = $1'} LIMIT 1`,
      [recipientEmail || recipientPhone]
    );
    const recipient = recipientResult.rows[0];
    if (!recipient) return res.status(404).json({ error: 'No JEDIDA user found with that email/phone.' });
    if (recipient.id === req.user.id) return res.status(400).json({ error: 'You cannot transfer money to yourself.' });

    const feeSettings = await getWalletFeeSettings();
    const feeAmount = Math.round((numericAmount * (feeSettings.transferFeePercent / 100) + Number(feeSettings.transferFeeFlat || 0)) * 100) / 100;
    const netAmount = numericAmount - feeAmount;
    if (netAmount <= 0) return res.status(400).json({ error: 'Amount is too small after fees.' });

    const transfer = await withTransaction(async (client) => {
      const senderWallet = await client.query(
        `UPDATE wallets SET balance = balance - $1 WHERE owner_id = $2 AND type = 'user' AND balance >= $1 RETURNING *`,
        [numericAmount, req.user.id]
      );
      if (senderWallet.rows.length === 0) {
        const err = new Error('INSUFFICIENT_FUNDS'); err.code = 'INSUFFICIENT_FUNDS'; throw err;
      }
      let recipientWallet = await client.query(`SELECT * FROM wallets WHERE owner_id = $1 AND type = 'user' FOR UPDATE`, [recipient.id]);
      if (recipientWallet.rows.length === 0) {
        recipientWallet = await client.query(
          `INSERT INTO wallets (owner_id, type, balance, currency) VALUES ($1,'user',0,$2) RETURNING *`,
          [recipient.id, senderWallet.rows[0].currency]
        );
      }
      const newRecipientBalance = Number(recipientWallet.rows[0].balance) + netAmount;
      await client.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newRecipientBalance, recipientWallet.rows[0].id]);

      const inserted = await client.query(
        `INSERT INTO wallet_transfers (from_user_id, to_user_id, from_wallet_id, to_wallet_id, amount, fee_amount, net_amount, currency, note, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.id, recipient.id, senderWallet.rows[0].id, recipientWallet.rows[0].id, numericAmount, feeAmount, netAmount, senderWallet.rows[0].currency, note || null, clientIdempotencyKey]
      );

      await logWalletTransaction(client, {
        walletId: senderWallet.rows[0].id, direction: 'debit', amount: numericAmount, balanceAfter: senderWallet.rows[0].balance,
        referenceType: 'transfer_out', referenceId: inserted.rows[0].id, note: `Transfer to ${recipient.full_name}`, createdBy: req.user.id,
      });
      await logWalletTransaction(client, {
        walletId: recipientWallet.rows[0].id, direction: 'credit', amount: netAmount, balanceAfter: newRecipientBalance,
        referenceType: 'transfer_in', referenceId: inserted.rows[0].id, note: `Transfer from ${senderName}`, createdBy: req.user.id,
      });

      await postTransaction(client, {
        idempotencyKey: `wallet_transfer:${inserted.rows[0].id}`,
        transactionType: 'transfer',
        status: 'succeeded',
        source: 'wallet',
        amount: numericAmount,
        feeAmount,
        netAmount,
        currency: senderWallet.rows[0].currency,
        buyerId: req.user.id,
        actorId: req.user.id,
        sourceWalletId: senderWallet.rows[0].id,
        destinationWalletId: recipientWallet.rows[0].id,
        metadata: { toUserId: recipient.id, note: note || null },
        createdBy: req.user.id,
      });

      await notifyRecipient(client, recipient.id, req.user.id, netAmount, senderWallet.rows[0].currency);
      return inserted.rows[0];
    });

    res.status(201).json({ transfer });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Insufficient wallet balance for this transfer.' });
    console.error('createTransfer failed:', err);
    res.status(500).json({ error: 'Could not complete this transfer.' });
  }
}

async function notifyRecipient(client, recipientId, senderId, netAmount, currency) {
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'system_announcement','Money received',$2,$3)`,
    [recipientId, `You received ${netAmount} ${currency} via a JEDIDA wallet transfer.`, senderId]
  );
}

// GET /api/wallet/transfers/mine
export async function myTransfers(req, res) {
  try {
    const result = await query(
      `SELECT wt.*, us.full_name AS sender_name, ur.full_name AS recipient_name
       FROM wallet_transfers wt
       JOIN users us ON us.id = wt.from_user_id
       JOIN users ur ON ur.id = wt.to_user_id
       WHERE wt.from_user_id = $1 OR wt.to_user_id = $1
       ORDER BY wt.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ transfers: result.rows });
  } catch (err) {
    console.error('myTransfers failed:', err);
    res.status(500).json({ error: 'Could not load your transfers.' });
  }
}
