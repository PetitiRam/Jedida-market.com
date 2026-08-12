import { query } from '../config/db.js';

// Record a security event to the audit log
export async function recordSecurityEvent({
  eventType,
  severity,
  userId = null,
  ipAddress = null,
  summary = '',
  metadata = {}
}) {
  try {
    // Only log if we have at least a type and summary
    if (!eventType || !summary) {
      console.warn('recordSecurityEvent called with missing required fields:', { eventType, summary });
      return;
    }

    await query(
      `INSERT INTO security_events (event_type, severity, user_id, ip_address, summary, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [eventType, severity, userId, ipAddress, summary, JSON.stringify(metadata)]
    );
  } catch (err) {
    // Don't let audit logging failures crash the application
    console.error('Failed to record security event:', err.message);
  }
}

// How many recent failed logins from one IP trip an automatic block, and
// how far back "recent" looks. Acts immediately per-request, unlike
// petitiSecurityEngine.js's scanBruteForce which runs on a schedule over
// a caller-supplied map of counts.
const FAILED_LOGIN_WINDOW = '15 minutes';
const AUTO_BLOCK_THRESHOLD = 15;

// Checked by ipBlockGuard on every request. An IP only counts as blocked
// while it hasn't been unblocked and, if it has an expiry, hasn't expired.
export async function isIpBlocked(ip) {
  if (!ip || ip === 'unknown') return false;
  try {
    const result = await query(
      `SELECT 1 FROM blocked_ips
       WHERE ip_address = $1 AND unblocked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())`,
      [ip]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error('Failed to check blocked IP:', err.message);
    return false;
  }
}

// Fire-and-forget from ipBlockGuard: a blocked IP that keeps knocking is
// worth counting for the dashboard, but must never delay or risk the 403
// response it's describing.
export async function recordBlockedIpHit(ip) {
  try {
    await query(
      `UPDATE blocked_ips SET hit_count = hit_count + 1 WHERE ip_address = $1 AND unblocked_at IS NULL`,
      [ip]
    );
    await recordSecurityEvent({
      eventType: 'ip_blocked_hit',
      severity: 2,
      ipAddress: ip,
      summary: `Blocked IP ${ip} attempted a request.`
    });
  } catch (err) {
    console.error('Failed to record blocked IP hit:', err.message);
  }
}

// Inserts (or refreshes) an automatic block once recordFailedLogin sees
// AUTO_BLOCK_THRESHOLD+ recent failures from the same IP. blocked_by is
// 'ai' so the dashboard can tell it apart from an admin's manual block
// (securityOpsController.js's blockIp uses 'admin'). `ip` is set alongside
// `ip_address` since `ip` is still the table's primary key.
async function autoBlockIfNeeded(ip, failedCount) {
  if (failedCount < AUTO_BLOCK_THRESHOLD) return;
  await query(
    `INSERT INTO blocked_ips (ip, ip_address, reason, blocked_by)
     VALUES ($1, $1, $2, 'ai')
     ON CONFLICT (ip_address) DO UPDATE
       SET reason = EXCLUDED.reason, blocked_by = 'ai', unblocked_at = NULL, unblocked_by = NULL`,
    [ip, `${failedCount} failed logins from ${ip} within ${FAILED_LOGIN_WINDOW}.`]
  );
  await recordSecurityEvent({
    eventType: 'ip_auto_blocked',
    severity: 4,
    ipAddress: ip,
    summary: `IP ${ip} auto-blocked after ${failedCount} failed logins.`,
    metadata: { failedCount }
  });
}

// Called (fire-and-forget) from authController.js's logLoginAttempt right
// after a failed login is written to login_attempts. Counts recent
// failures from this IP and auto-blocks past the threshold. Must not
// throw back into the login flow — caller already wraps this in
// .catch(() => {}), but guard internally too since it also does its own
// queries.
export async function recordFailedLogin(ip, identifier) {
  if (!ip || ip === 'unknown') return;
  try {
    const result = await query(
      `SELECT COUNT(*)::int AS count FROM login_attempts
       WHERE ip_address = $1 AND success = FALSE
         AND created_at > now() - interval '${FAILED_LOGIN_WINDOW}'`,
      [ip]
    );
    const failedCount = result.rows[0]?.count || 0;
    await recordSecurityEvent({
      eventType: 'brute_force_detected',
      severity: failedCount >= AUTO_BLOCK_THRESHOLD ? 4 : 2,
      ipAddress: ip,
      summary: `Failed login for ${identifier} from ${ip} (${failedCount} recent failures).`,
      metadata: { identifier, failedCount }
    });
    await autoBlockIfNeeded(ip, failedCount);
  } catch (err) {
    console.error('Failed to record failed login:', err.message);
  }
}

// Fire-and-forget from server.js's rate-limiter handlers (apiLimiter,
// authLimiter, withdrawalLimiter, payoutMethodLimiter). Just logs — a
// single rate-limit trip isn't itself grounds for an IP block, that's
// what recordFailedLogin/autoBlockIfNeeded are for on the auth path.
export async function recordRateLimitBlock(ip, path) {
  try {
    await recordSecurityEvent({
      eventType: 'rate_limit_blocked',
      severity: 2,
      ipAddress: ip,
      summary: `Rate limit exceeded for ${path} from ${ip}.`,
      metadata: { path }
    });
  } catch (err) {
    console.error('Failed to record rate limit block:', err.message);
  }
}

export async function recordUploadAudit({
  userId = null,
  ipAddress = null,
  fileName = null,
  fileSize = null,
  mimeType = null,
  status = 'unknown',
  rejectionReason = null
}) {
  try {
    await query(
      `INSERT INTO media_upload_audit (user_id, ip_address, file_name, file_size, mime_type, status, rejection_reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [userId, ipAddress, fileName, fileSize, mimeType, status, rejectionReason]
    );
  } catch (err) {
    console.error('Failed to record upload audit:', err.message);
  }
}
