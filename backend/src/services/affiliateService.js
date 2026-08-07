import cryptoRandomString from 'crypto-random-string';
import { query, withTransaction } from '../config/db.js';
import * as settingsService from './settingsService.js';
import { createAlert, log } from '../../ai/petiti/petitiService.js';

// Falls back to these when the admin hasn't (or hasn't fully) configured
// the 'affiliate' settings section yet — every field here is also declared
// in settingsService.SECTION_COLUMNS.affiliate.fields, so PATCHing any
// subset from Admin Dashboard → Settings → Affiliate Program merges over
// just these defaults, same as every other settings section.
const DEFAULT_AFFILIATE_SETTINGS = {
  affiliateProgramEnabled: true,
  upgradeCommissionPercent: 10,
  salesCommissionPercent: 2,
  minimumWithdrawal: 10000,
  withdrawalMethods: [
    { id: 'mobile_money', name: 'Mobile Money' },
    { id: 'bank_transfer', name: 'Bank Transfer' }
  ],
  selfReferralBlocked: true,
  maxReferralsPerDeviceOrIpPerDay: 5,
  maxCommissionsPerDayBeforeHold: 20
};

async function getAffiliateSettings() {
  const section = await settingsService.getSection('affiliate');
  return { ...DEFAULT_AFFILIATE_SETTINGS, ...section };
}

function clientIp(req) {
  return req.ip || req.headers?.['x-forwarded-for'] || 'unknown';
}

// ---------------------------------------------------------------------------
// Referral code / link
// ---------------------------------------------------------------------------

function generateCode(fullName) {
  const prefix = String(fullName || '').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'JED';
  return `${prefix}${cryptoRandomString({ length: 6, type: 'alphanumeric' }).toUpperCase()}`;
}

// Every registered user gets a referral code lazily, the first time it's
// asked for — avoids a second write path having to stay in sync with
// registration (there are three: password signup, Google signup, and any
// future one), and legacy users who existed before this migration still
// get one on first visit to the Affiliate page.
export async function ensureReferralCode(userId) {
  const existing = await query('SELECT referral_code, full_name FROM users WHERE id = $1', [userId]);
  const row = existing.rows[0];
  if (!row) return null;
  if (row.referral_code) return row.referral_code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode(row.full_name);
    try {
      const result = await query(
        `UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL RETURNING referral_code`,
        [code, userId]
      );
      if (result.rows[0]) return result.rows[0].referral_code;
      // Someone else's concurrent request already set it — read it back.
      const re = await query('SELECT referral_code FROM users WHERE id = $1', [userId]);
      if (re.rows[0]?.referral_code) return re.rows[0].referral_code;
    } catch (err) {
      if (err.code !== '23505') throw err; // unique violation — retry with a new code
    }
  }
  throw new Error('Could not generate a unique referral code.');
}

export function buildReferralLink(referralCode) {
  const base = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://jedidamarketplace.com';
  return `${base.replace(/\/$/, '')}/signup?ref=${referralCode}`;
}

export async function getMyReferralInfo(userId) {
  const referralCode = await ensureReferralCode(userId);
  return { referralCode, referralLink: buildReferralLink(referralCode) };
}

// ---------------------------------------------------------------------------
// Registration hook — called once, right after a new user row is created,
// by both the password (registerStep2) and Google (googleAuth) sign-up
// paths. Records the referral permanently and runs rule-based fraud checks
// (self-referral, duplicate device/IP, referral velocity/abuse) — mirrors
// the pattern contactModerationEngine.js already established for chat: a
// rule-based check that files a Petiti alert rather than blocking anything
// outright. Never throws — a fraud-check or notification failure must
// never break registration.
// ---------------------------------------------------------------------------
export async function recordReferralOnRegister({ referralCode, newUser, signupIp, device }) {
  if (!referralCode) return null;
  try {
    const settings = await getAffiliateSettings();
    if (!settings.affiliateProgramEnabled) return null;

    const referrerResult = await query(
      'SELECT id, phone_number, email FROM users WHERE referral_code = $1',
      [String(referralCode).trim().toUpperCase()]
    );
    const referrer = referrerResult.rows[0];
    if (!referrer || referrer.id === newUser.id) return null; // invalid code, or (defensively) literal self-use

    const deviceId = device?.id || null;
    const ip = signupIp && signupIp !== 'unknown' ? signupIp : null;
    const reasons = [];

    if (settings.selfReferralBlocked) {
      if (referrer.phone_number && newUser.phone_number && referrer.phone_number === newUser.phone_number) {
        reasons.push('self_referral');
      }
      if (referrer.email && newUser.email && referrer.email === newUser.email) {
        reasons.push('self_referral');
      }
    }

    if (deviceId) {
      const dupDevice = await query(
        `SELECT 1 FROM affiliate_referrals WHERE referrer_id = $1 AND signup_device_id = $2 LIMIT 1`,
        [referrer.id, deviceId]
      );
      if (dupDevice.rows.length > 0) reasons.push('duplicate_device');
    }
    if (ip) {
      const dupIp = await query(
        `SELECT 1 FROM affiliate_referrals
         WHERE referrer_id = $1 AND signup_ip = $2 AND created_at > now() - interval '24 hours' LIMIT 1`,
        [referrer.id, ip]
      );
      if (dupIp.rows.length > 0) reasons.push('duplicate_ip');
    }

    const velocity = await query(
      `SELECT COUNT(*) FROM affiliate_referrals WHERE referrer_id = $1 AND created_at > now() - interval '24 hours'`,
      [referrer.id]
    );
    if (Number(velocity.rows[0].count) >= Number(settings.maxReferralsPerDeviceOrIpPerDay || 5)) {
      reasons.push('referral_abuse');
    }

    const fraudFlag = reasons[0] || null;

    // The relationship is recorded regardless of the fraud flag — the spec
    // requires it be "permanently recorded once a new user successfully
    // registers." A flag only affects whether commissions from this
    // relationship later land as 'held' instead of 'available'.
    const inserted = await query(
      `INSERT INTO affiliate_referrals (referrer_id, referred_user_id, referral_code_used, signup_ip, signup_device_id, fraud_flag)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING *`,
      [referrer.id, newUser.id, referralCode, ip, deviceId, fraudFlag]
    );
    if (inserted.rows.length === 0) return null; // this user already has a recorded referral

    await query('UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL', [referrer.id, newUser.id]);

    if (fraudFlag) {
      await createAlert({
        actor: 'petiti',
        severity: fraudFlag === 'self_referral' ? 'high' : 'medium',
        title: 'Suspicious referral detected',
        description: `A referral signup by ${newUser.full_name || newUser.email || newUser.id} under referrer ${referrer.id} was flagged: ${fraudFlag}.`,
        relatedUserId: referrer.id,
        metadata: { referralId: inserted.rows[0].id, referredUserId: newUser.id, fraudFlag }
      });
    } else {
      await query(
        `INSERT INTO notifications (user_id, type, title, body, metadata)
         VALUES ($1, 'affiliate_referral_joined', 'Someone joined using your referral link', $2, $3)`,
        [referrer.id, `${newUser.full_name || 'A new user'} signed up using your referral link.`,
          { referredUserId: newUser.id }]
      );
    }

    return inserted.rows[0];
  } catch (err) {
    console.error('Record referral error:', err);
    try { await log('petiti', 'error', 'affiliate', 'Failed to record referral', { error: err.message }); } catch { /* best-effort */ }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wallet bookkeeping helpers — shared by the two commission-crediting
// functions below. `client` must already be inside a transaction.
// ---------------------------------------------------------------------------
async function creditWalletForCommission(client, { referrerId, amount, currency, type, status }) {
  await client.query(
    `INSERT INTO affiliate_wallets (user_id, currency) VALUES ($1,$2)
     ON CONFLICT (user_id) DO NOTHING`,
    [referrerId, currency]
  );
  const bucketColumn = status === 'held' ? 'pending_earnings' : 'available_balance';
  await client.query(
    `UPDATE affiliate_wallets SET
       ${bucketColumn} = ${bucketColumn} + $1,
       total_earnings = total_earnings + $1,
       upgrade_commissions_total = upgrade_commissions_total + CASE WHEN $3 = 'upgrade' THEN $1 ELSE 0 END,
       sales_commissions_total   = sales_commissions_total   + CASE WHEN $3 = 'sale'    THEN $1 ELSE 0 END,
       updated_at = now()
     WHERE user_id = $2`,
    [amount, referrerId, type]
  );
}

// Rule-based hold decision for a single commission event — mirrors the
// "flag unusually large" heuristic already used in walletsController.js's
// requestWithdrawal, applied here to a referrer's recent commission volume.
async function decideCommissionStatus(client, { referrerId, referredUserId, settings }) {
  const referral = await client.query(
    'SELECT fraud_flag FROM affiliate_referrals WHERE referred_user_id = $1',
    [referredUserId]
  );
  if (referral.rows[0]?.fraud_flag) {
    return { status: 'held', reason: `Referral was flagged: ${referral.rows[0].fraud_flag}.` };
  }

  const recent = await client.query(
    `SELECT COUNT(*) AS cnt FROM affiliate_commissions
     WHERE referrer_id = $1 AND created_at > now() - interval '24 hours' AND status != 'rejected'`,
    [referrerId]
  );
  const maxPerDay = Number(settings.maxCommissionsPerDayBeforeHold || 20);
  if (Number(recent.rows[0].cnt) >= maxPerDay) {
    return { status: 'held', reason: `Referrer received ${recent.rows[0].cnt}+ commissions in the last 24 hours.` };
  }

  return { status: 'available', reason: null };
}

// ---------------------------------------------------------------------------
// Called from upgradeController.reviewUpgrade() on the 'approve' action —
// the single point a role upgrade is finalized. Wrapped so a failure here
// never blocks the upgrade approval response itself.
// ---------------------------------------------------------------------------
export async function creditUpgradeCommission(upgrade) {
  try {
    const referredResult = await query('SELECT id, full_name, referred_by FROM users WHERE id = $1', [upgrade.user_id]);
    const referredUser = referredResult.rows[0];
    const referrerId = referredUser?.referred_by;
    if (!referrerId) return null; // this user wasn't referred by anyone

    const settings = await getAffiliateSettings();
    if (!settings.affiliateProgramEnabled) return null;

    const baseAmount = Number(upgrade.verification_fee_amount || 0);
    const percent = Number(settings.upgradeCommissionPercent || 0);
    const amount = Math.round(baseAmount * percent) / 100;
    if (!(amount > 0)) return null;

    const platformResult = await query('SELECT default_currency FROM platform_settings WHERE id = 1');
    const currency = platformResult.rows[0]?.default_currency || 'UGX';

    const commission = await withTransaction(async (client) => {
      const { status, reason } = await decideCommissionStatus(client, {
        referrerId, referredUserId: upgrade.user_id, settings
      });

      const inserted = await client.query(
        `INSERT INTO affiliate_commissions
           (referrer_id, referred_user_id, type, source_id, base_amount, percent_applied, amount, currency, status, hold_reason)
         VALUES ($1,$2,'upgrade',$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (type, source_id) DO NOTHING
         RETURNING *`,
        [referrerId, upgrade.user_id, upgrade.id, baseAmount, percent, amount, currency, status, reason]
      );
      if (inserted.rows.length === 0) return null; // already credited for this upgrade

      await creditWalletForCommission(client, { referrerId, amount, currency, type: 'upgrade', status });

      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, metadata)
         VALUES ($1, 'affiliate_commission_earned', $2, $3, $4)`,
        [
          referrerId,
          status === 'held' ? 'Commission pending review' : 'Referral commission earned',
          status === 'held'
            ? `You earned ${amount} ${currency} from ${referredUser.full_name}'s upgrade. It's being reviewed before becoming available.`
            : `You earned ${amount} ${currency} from ${referredUser.full_name}'s upgrade.`,
          { commissionId: inserted.rows[0].id, type: 'upgrade', upgradeId: upgrade.id }
        ]
      );

      return inserted.rows[0];
    });

    if (commission?.status === 'held') {
      await createAlert({
        actor: 'petiti', severity: 'medium',
        title: 'Affiliate commission held for review',
        description: `An upgrade commission of ${amount} ${currency} for referrer ${referrerId} was held: ${commission.hold_reason}`,
        relatedUserId: referrerId,
        metadata: { commissionId: commission.id, upgradeId: upgrade.id }
      });
    }
    return commission;
  } catch (err) {
    console.error('Credit upgrade commission error:', err);
    try { await log('petiti', 'error', 'affiliate', 'Failed to credit upgrade commission', { upgradeId: upgrade.id, error: err.message }); } catch { /* best-effort */ }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Called from ordersController.payOutClaimedOrder() INSIDE the same escrow
// payout transaction — guarantees the commission and the payout succeed or
// fail together, and that a refunded order (only possible before payout)
// can never also generate a commission. Never throws — the caller does not
// catch around this call, so a bug here must not roll back a real payout.
// ---------------------------------------------------------------------------
export async function creditSaleCommission(client, order) {
  try {
    const referredResult = await client.query('SELECT full_name, referred_by FROM users WHERE id = $1', [order.seller_id]);
    const referrerId = referredResult.rows[0]?.referred_by;
    if (!referrerId) return null;

    const settingsRow = await client.query('SELECT affiliate_settings FROM platform_settings WHERE id = 1');
    const settings = { ...DEFAULT_AFFILIATE_SETTINGS, ...(settingsRow.rows[0]?.affiliate_settings || {}) };
    if (!settings.affiliateProgramEnabled) return null;

    const baseAmount = Number(order.total_amount || 0);
    const percent = Number(settings.salesCommissionPercent || 0);
    const amount = Math.round(baseAmount * percent) / 100;
    if (!(amount > 0)) return null;

    const { status, reason } = await decideCommissionStatus(client, {
      referrerId, referredUserId: order.seller_id, settings
    });

    const inserted = await client.query(
      `INSERT INTO affiliate_commissions
         (referrer_id, referred_user_id, type, source_id, base_amount, percent_applied, amount, currency, status, hold_reason)
       VALUES ($1,$2,'sale',$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (type, source_id) DO NOTHING
       RETURNING *`,
      [referrerId, order.seller_id, order.id, baseAmount, percent, amount, order.currency, status, reason]
    );
    if (inserted.rows.length === 0) return null; // already credited for this order

    await creditWalletForCommission(client, { referrerId, amount, currency: order.currency, type: 'sale', status });

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, 'affiliate_commission_earned', $2, $3, $4)`,
      [
        referrerId,
        status === 'held' ? 'Commission pending review' : 'Referral sale commission earned',
        status === 'held'
          ? `You earned ${amount} ${order.currency} from a sale by your referral. It's being reviewed before becoming available.`
          : `You earned ${amount} ${order.currency} from a sale by your referral.`,
        { commissionId: inserted.rows[0].id, type: 'sale', orderId: order.id }
      ]
    );

    // Held-for-review alert is filed after commit (best-effort, non-blocking)
    // by the caller checking the returned row's status — see ordersController.
    return inserted.rows[0];
  } catch (err) {
    console.error('Credit sale commission error:', err);
    return null;
  }
}

// Fires the Petiti alert for a held sale commission. Split out from
// creditSaleCommission because that function runs inside the payout's DB
// transaction and an alert-service call shouldn't be able to roll back a
// real payout if it throws; the caller invokes this afterward, outside the
// transaction, only when the returned commission's status is 'held'.
export async function alertHeldSaleCommission(commission) {
  if (!commission || commission.status !== 'held') return;
  try {
    await createAlert({
      actor: 'petiti', severity: 'medium',
      title: 'Affiliate commission held for review',
      description: `A sale commission of ${commission.amount} ${commission.currency} for referrer ${commission.referrer_id} was held: ${commission.hold_reason}`,
      relatedUserId: commission.referrer_id,
      metadata: { commissionId: commission.id, orderId: commission.source_id }
    });
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getAffiliateWallet(userId) {
  const result = await query('SELECT * FROM affiliate_wallets WHERE user_id = $1', [userId]);
  if (result.rows[0]) return result.rows[0];
  const inserted = await query(
    `INSERT INTO affiliate_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING *`,
    [userId]
  );
  return inserted.rows[0] || (await query('SELECT * FROM affiliate_wallets WHERE user_id = $1', [userId])).rows[0];
}

export async function listMyCommissions(userId, { type, status } = {}) {
  const conditions = ['referrer_id = $1'];
  const values = [userId];
  if (type) { values.push(type); conditions.push(`type = $${values.length}`); }
  if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
  const result = await query(
    `SELECT c.*, u.full_name AS referred_user_name
     FROM affiliate_commissions c JOIN users u ON u.id = c.referred_user_id
     WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC LIMIT 200`,
    values
  );
  return result.rows;
}

export async function listMyReferrals(userId) {
  const result = await query(
    `SELECT r.id, r.created_at, r.fraud_flag, u.full_name, u.email, u.primary_role,
            EXISTS(SELECT 1 FROM role_upgrades ru WHERE ru.user_id = u.id AND ru.status = 'approved') AS has_upgraded
     FROM affiliate_referrals r JOIN users u ON u.id = r.referred_user_id
     WHERE r.referrer_id = $1 ORDER BY r.created_at DESC LIMIT 200`,
    [userId]
  );
  return result.rows;
}

export async function listMyWithdrawals(userId) {
  const result = await query('SELECT * FROM affiliate_withdrawals WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------
export async function requestWithdrawal(userId, { amount, method, destination }) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    const err = new Error('A valid withdrawal amount is required.'); err.code = 'BAD_REQUEST'; throw err;
  }
  const settings = await getAffiliateSettings();
  if (!settings.affiliateProgramEnabled) {
    const err = new Error('The affiliate program is currently disabled.'); err.code = 'BAD_REQUEST'; throw err;
  }
  const allowedMethods = (settings.withdrawalMethods || []).map((m) => m.id);
  if (!allowedMethods.includes(method)) {
    const err = new Error('Unsupported withdrawal method.'); err.code = 'BAD_REQUEST'; throw err;
  }
  const minimum = Number(settings.minimumWithdrawal || 0);
  if (numericAmount < minimum) {
    const err = new Error(`Minimum withdrawal amount is ${minimum}.`); err.code = 'BAD_REQUEST'; throw err;
  }

  const inFlight = await query(
    `SELECT * FROM affiliate_withdrawals WHERE user_id = $1 AND amount = $2 AND method = $3
       AND status = 'pending' AND created_at > now() - interval '10 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [userId, numericAmount, method]
  );
  if (inFlight.rows.length > 0) return { withdrawal: inFlight.rows[0], alreadySubmitted: true };

  const withdrawal = await withTransaction(async (client) => {
    // Same atomic-guard shape as walletsController.requestWithdrawal: the
    // balance check happens as part of the same guarded UPDATE that moves
    // the money, so two concurrent requests can't both pass and both debit.
    const held = await client.query(
      `UPDATE affiliate_wallets
       SET available_balance = available_balance - $1, pending_withdrawal = pending_withdrawal + $1, updated_at = now()
       WHERE user_id = $2 AND available_balance >= $1
       RETURNING *`,
      [numericAmount, userId]
    );
    if (held.rows.length === 0) {
      const err = new Error('INSUFFICIENT_FUNDS'); err.code = 'INSUFFICIENT_FUNDS'; throw err;
    }
    const wallet = held.rows[0];

    const inserted = await client.query(
      `INSERT INTO affiliate_withdrawals (user_id, amount, currency, method, destination)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, numericAmount, wallet.currency, method, destination || null]
    );

    await client.query(
      `INSERT INTO affiliate_ledger (user_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
       VALUES ($1,'debit',$2,$3,'withdrawal_hold',$4,'Funds held pending withdrawal review',$1)`,
      [userId, numericAmount, wallet.available_balance, inserted.rows[0].id]
    );

    return inserted.rows[0];
  });

  return { withdrawal, alreadySubmitted: false };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export async function adminOverview() {
  const [referrals, commissions, withdrawals] = await Promise.all([
    query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE fraud_flag IS NOT NULL) AS flagged FROM affiliate_referrals`),
    query(`SELECT
             COALESCE(SUM(amount) FILTER (WHERE status = 'available'), 0) AS available_total,
             COALESCE(SUM(amount) FILTER (WHERE status = 'held'), 0) AS held_total,
             COUNT(*) FILTER (WHERE status = 'held') AS held_count
           FROM affiliate_commissions`),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
                  COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_total
           FROM affiliate_withdrawals`)
  ]);
  return {
    totalReferrals: Number(referrals.rows[0].total),
    flaggedReferrals: Number(referrals.rows[0].flagged),
    availableCommissionsTotal: Number(commissions.rows[0].available_total),
    heldCommissionsTotal: Number(commissions.rows[0].held_total),
    heldCommissionsCount: Number(commissions.rows[0].held_count),
    pendingWithdrawalsCount: Number(withdrawals.rows[0].pending_count),
    pendingWithdrawalsTotal: Number(withdrawals.rows[0].pending_total)
  };
}

export async function adminListReferrals({ flagged } = {}) {
  const where = flagged === 'true' ? 'WHERE r.fraud_flag IS NOT NULL' : '';
  const result = await query(
    `SELECT r.*, referrer.full_name AS referrer_name, referrer.email AS referrer_email,
            referred.full_name AS referred_name, referred.email AS referred_email
     FROM affiliate_referrals r
     JOIN users referrer ON referrer.id = r.referrer_id
     JOIN users referred ON referred.id = r.referred_user_id
     ${where}
     ORDER BY r.created_at DESC LIMIT 300`
  );
  return result.rows;
}

export async function adminListHeldCommissions() {
  const result = await query(
    `SELECT c.*, ref.full_name AS referrer_name, ref.email AS referrer_email, u.full_name AS referred_user_name
     FROM affiliate_commissions c
     JOIN users ref ON ref.id = c.referrer_id
     JOIN users u ON u.id = c.referred_user_id
     WHERE c.status = 'held' ORDER BY c.created_at DESC LIMIT 200`
  );
  return result.rows;
}

export async function adminReviewCommission(commissionId, decision, adminId) {
  if (!['approve', 'reject'].includes(decision)) {
    const err = new Error('Decision must be "approve" or "reject".'); err.code = 'BAD_REQUEST'; throw err;
  }
  return withTransaction(async (client) => {
    const flipped = await client.query(
      `UPDATE affiliate_commissions SET status = $1, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 AND status = 'held' RETURNING *`,
      [decision === 'approve' ? 'available' : 'rejected', adminId, commissionId]
    );
    if (flipped.rows.length === 0) { const err = new Error('ALREADY_REVIEWED'); err.code = 'ALREADY_REVIEWED'; throw err; }
    const commission = flipped.rows[0];

    if (decision === 'approve') {
      await client.query(
        `UPDATE affiliate_wallets SET pending_earnings = pending_earnings - $1, available_balance = available_balance + $1, updated_at = now()
         WHERE user_id = $2`,
        [commission.amount, commission.referrer_id]
      );
    } else {
      await client.query(
        `UPDATE affiliate_wallets SET
           pending_earnings = pending_earnings - $1,
           total_earnings = total_earnings - $1,
           upgrade_commissions_total = upgrade_commissions_total - CASE WHEN $3 = 'upgrade' THEN $1 ELSE 0 END,
           sales_commissions_total   = sales_commissions_total   - CASE WHEN $3 = 'sale'    THEN $1 ELSE 0 END,
           updated_at = now()
         WHERE user_id = $2`,
        [commission.amount, commission.referrer_id, commission.type]
      );
    }

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, sent_by)
       VALUES ($1, 'affiliate_commission_earned', $2, $3, $4)`,
      [
        commission.referrer_id,
        decision === 'approve' ? 'Held commission approved' : 'Held commission rejected',
        decision === 'approve'
          ? `Your ${commission.amount} ${commission.currency} commission cleared review and is now available.`
          : `A ${commission.amount} ${commission.currency} commission was rejected after review.`,
        adminId
      ]
    );

    return commission;
  });
}

export async function adminListWithdrawals({ status } = {}) {
  const where = status ? 'WHERE w.status = $1' : '';
  const values = status ? [status] : [];
  const result = await query(
    `SELECT w.*, u.full_name, u.email FROM affiliate_withdrawals w JOIN users u ON u.id = w.user_id
     ${where} ORDER BY w.created_at DESC LIMIT 200`,
    values
  );
  return result.rows;
}

export async function adminReviewWithdrawal(withdrawalId, decision, adminId) {
  if (!['approve', 'reject'].includes(decision)) {
    const err = new Error('Decision must be "approve" or "reject".'); err.code = 'BAD_REQUEST'; throw err;
  }
  return withTransaction(async (client) => {
    const newStatus = decision === 'approve' ? 'paid' : 'rejected';
    const flipped = await client.query(
      `UPDATE affiliate_withdrawals SET status = $1, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 AND status = 'pending' RETURNING *`,
      [newStatus, adminId, withdrawalId]
    );
    if (flipped.rows.length === 0) { const err = new Error('ALREADY_REVIEWED'); err.code = 'ALREADY_REVIEWED'; throw err; }
    const withdrawal = flipped.rows[0];

    if (decision === 'approve') {
      const wallet = await client.query(
        `UPDATE affiliate_wallets SET pending_withdrawal = pending_withdrawal - $1, updated_at = now()
         WHERE user_id = $2 RETURNING *`,
        [withdrawal.amount, withdrawal.user_id]
      );
      await client.query(
        `INSERT INTO affiliate_ledger (user_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
         VALUES ($1,'debit',$2,$3,'withdrawal_paid',$4,'Withdrawal paid out',$5)`,
        [withdrawal.user_id, withdrawal.amount, wallet.rows[0].available_balance, withdrawal.id, adminId]
      );
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, sent_by)
         VALUES ($1,'affiliate_withdrawal_update','Withdrawal approved',$2,$3)`,
        [withdrawal.user_id, `Your affiliate withdrawal of ${withdrawal.amount} ${withdrawal.currency} has been approved and paid out.`, adminId]
      );
    } else {
      const wallet = await client.query(
        `UPDATE affiliate_wallets SET available_balance = available_balance + $1, pending_withdrawal = pending_withdrawal - $1, updated_at = now()
         WHERE user_id = $2 RETURNING *`,
        [withdrawal.amount, withdrawal.user_id]
      );
      await client.query(
        `INSERT INTO affiliate_ledger (user_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
         VALUES ($1,'credit',$2,$3,'withdrawal_refund',$4,'Withdrawal declined — funds returned',$5)`,
        [withdrawal.user_id, withdrawal.amount, wallet.rows[0].available_balance, withdrawal.id, adminId]
      );
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, sent_by)
         VALUES ($1,'affiliate_withdrawal_update','Withdrawal rejected',$2,$3)`,
        [withdrawal.user_id, 'Your affiliate withdrawal request was declined and the funds were returned to your affiliate wallet.', adminId]
      );
    }

    return newStatus;
  });
}

export { clientIp };
