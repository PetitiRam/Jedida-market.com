import { query } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';

// Masks an account identifier for logging/audit purposes — the audit
// trail should show *that* a payout method changed, not the full
// account/phone number.
function mask(identifier) {
  const str = String(identifier || '');
  if (str.length <= 4) return '*'.repeat(str.length);
  return `${'*'.repeat(str.length - 4)}${str.slice(-4)}`;
}

export async function getMyPayoutMethod(req, res) {
  try {
    const result = await query(
      `SELECT id, method_type, provider, account_name,
              right(account_identifier, 4) AS account_identifier_last4,
              last_changed_at, created_at
       FROM payout_methods WHERE user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.json({ payoutMethod: null });
    return res.json({ payoutMethod: result.rows[0] });
  } catch (err) {
    console.error('Get payout method error:', err);
    return res.status(500).json({ error: 'Could not load payout method.' });
  }
}

// Requires face verification (see requireFaceVerification('payout_method_change')
// on the route) and MFA (requireMfaEnabled) — this is exactly "Changing
// bank accounts" / "Changing mobile money numbers" from the security
// brief. account_name should match the KYC identity on file; that
// cross-check happens at admin review time (flagged via risk signal),
// not blocked outright here, so a legitimate name variation (maiden
// name, joint account) doesn't lock someone out of their own withdrawal
// method.
export async function updateMyPayoutMethod(req, res) {
  const { methodType, provider, accountIdentifier, accountName } = req.body;

  if (!['bank_account', 'mobile_money'].includes(methodType)) {
    return res.status(400).json({ error: 'methodType must be "bank_account" or "mobile_money".' });
  }
  if (!provider || !String(provider).trim()) {
    return res.status(400).json({ error: 'Provider (bank name or mobile money network) is required.' });
  }
  if (!accountIdentifier || !String(accountIdentifier).trim()) {
    return res.status(400).json({ error: 'Account number or phone number is required.' });
  }
  if (!accountName || !String(accountName).trim()) {
    return res.status(400).json({ error: 'Account holder name is required.' });
  }

  try {
    const existing = await query('SELECT id, account_identifier FROM payout_methods WHERE user_id = $1', [req.user.id]);

    const result = await query(
      `INSERT INTO payout_methods (user_id, method_type, provider, account_identifier, account_name, last_changed_by)
       VALUES ($1,$2,$3,$4,$5,$1)
       ON CONFLICT (user_id) DO UPDATE SET
         method_type = EXCLUDED.method_type,
         provider = EXCLUDED.provider,
         account_identifier = EXCLUDED.account_identifier,
         account_name = EXCLUDED.account_name,
         last_changed_at = now(),
         last_changed_by = EXCLUDED.last_changed_by,
         updated_at = now()
       RETURNING id, method_type, provider, account_name, right(account_identifier, 4) AS account_identifier_last4`,
      [req.user.id, methodType, provider.trim(), accountIdentifier.trim(), accountName.trim()]
    );

    await logSecurityEvent(null, {
      actorId: req.user.id, actorRole: null,
      eventType: existing.rows.length > 0 ? 'payout_method_changed' : 'payout_method_added',
      entityType: 'payout_method', entityId: result.rows[0].id,
      metadata: {
        methodType,
        previousLast4: existing.rows[0] ? mask(existing.rows[0].account_identifier).slice(-4) : null,
        newLast4: accountIdentifier.trim().slice(-4),
        faceVerificationConfidence: req.faceVerification?.confidence ?? null,
        ip: req.ip,
      },
    });

    return res.json({ message: 'Payout method saved.', payoutMethod: result.rows[0] });
  } catch (err) {
    console.error('Update payout method error:', err);
    return res.status(500).json({ error: 'Could not save payout method.' });
  }
}
