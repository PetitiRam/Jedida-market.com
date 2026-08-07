import { query } from '../config/db.js';

let cache = null;
let cacheAt = 0;
const CACHE_MS = 10_000; // short cache so PETITI/admin changes apply within 10s, not on every request

export async function getAuthPolicy() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  const result = await query('SELECT * FROM auth_security_policy WHERE id = 1');
  cache = result.rows[0];
  cacheAt = now;
  return cache;
}

export function invalidateAuthPolicyCache() {
  cache = null;
}

const ALLOWED_FIELDS = {
  maxFailedLogins: 'max_failed_logins',
  lockoutMinutes: 'lockout_minutes',
  otpExpiryMinutes: 'otp_expiry_minutes',
  otpResendCooldownSeconds: 'otp_resend_cooldown_seconds',
  minPasswordLength: 'min_password_length',
  requirePasswordComplexity: 'require_password_complexity',
  accessTokenTtl: 'access_token_ttl',
  refreshTokenTtl: 'refresh_token_ttl',
  passwordHistoryLimit: 'password_history_limit',
  idleSessionTimeoutMinutes: 'idle_session_timeout_minutes',
  singleSessionEnforced: 'single_session_enforced'
};

// Bounded, validated update — the only way auth policy changes, whether
// triggered by an admin in Settings or by PETITI via petitiService.upgradeAuthPolicy.
// No arbitrary code, just numeric/string knobs within sane hard limits.
export async function updateAuthPolicy(patch, updatedBy = 'admin') {
  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, column] of Object.entries(ALLOWED_FIELDS)) {
    if (patch[key] === undefined) continue;
    let value = patch[key];

    // hard safety bounds — even an admin/AI cannot set these to unsafe extremes
    if (key === 'maxFailedLogins') value = Math.min(Math.max(Number(value), 3), 20);
    if (key === 'lockoutMinutes') value = Math.min(Math.max(Number(value), 1), 1440);
    if (key === 'otpExpiryMinutes') value = Math.min(Math.max(Number(value), 2), 60);
    if (key === 'otpResendCooldownSeconds') value = Math.min(Math.max(Number(value), 20), 600);
    if (key === 'minPasswordLength') value = Math.min(Math.max(Number(value), 12), 64);
    if (key === 'passwordHistoryLimit') value = Math.min(Math.max(Number(value), 0), 20);
    if (key === 'idleSessionTimeoutMinutes') value = Math.min(Math.max(Number(value), 30), 129600); // 30 min .. 90 days
    if (key === 'singleSessionEnforced') value = Boolean(value);

    sets.push(`${column} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (sets.length === 0) return getAuthPolicy();

  sets.push(`updated_by = $${i}`, `updated_at = now()`);
  values.push(updatedBy);
  i += 1;

  const result = await query(
    `UPDATE auth_security_policy SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
    values
  );
  invalidateAuthPolicyCache();
  return result.rows[0];
}
