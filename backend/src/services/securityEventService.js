import { query } from '../config/db.js';

// How many qualifying events from one IP inside the window trigger an
// automatic block. Deliberately conservative — false positives lock out a
// real user's whole household/office NAT, so this only fires on patterns
// that are hard to produce by accident.
const AUTO_BLOCK_WINDOW_MINUTES = 15;
const AUTO_BLOCK_FAILED_LOGIN_THRESHOLD = 8;
const AUTO_BLOCK_RATE_LIMIT_THRESHOLD = 5;

// Single write path for security_events — never throws, same contract as
// securityLogService.logSecurityEvent, because a logging failure must
// never block the request it's describing.
export async function recordSecurityEvent({ eventType, severity = 2, ipAddress = null, userId = null, requestPath = null, summary, metadata = {} }) {
  try {
    await query(
      `INSERT INTO security_events (event_type, severity, ip_address, user_id, request_path, summary, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [eventType, severity, ipAddress, userId, requestPath, summary, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Security event log error:', err);
  }
}

export async function isIpBlocked(ipAddress) {
  if (!ipAddress) return false;
  try {
    const { rows } = await query(
      `SELECT id FROM blocked_ips WHERE ip_address = $1 AND unblocked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())`,
      [ipAddress]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('IP block check error:', err);
    return false; // fail open on a DB hiccup — never take the whole API down over this check
  }
}

export async function recordBlockedIpHit(ipAddress) {
  try {
    await query(`UPDATE blocked_ips SET hit_count = hit_count + 1 WHERE ip_address = $1`, [ipAddress]);
  } catch (err) {
    console.error('Blocked IP hit-count error:', err);
  }
}

async function autoBlockIp(ipAddress, reason) {
  try {
    const { rows } = await query(
      `INSERT INTO blocked_ips (ip_address, reason, blocked_by) VALUES ($1, $2, 'ai')
       ON CONFLICT (ip_address) DO NOTHING RETURNING id`,
      [ipAddress, reason]
    );
    if (rows.length > 0) {
      await recordSecurityEvent({
        eventType: 'ip_auto_blocked', severity: 4, ipAddress,
        summary: `Automatically blocked ${ipAddress}: ${reason}`,
      });
    }
  } catch (err) {
    console.error('Auto-block error:', err);
  }
}

// Called from authController.logLoginAttempt on every failed login. Logs
// the event, and escalates to an automatic IP block if this address has
// crossed the failed-login threshold inside the window — a real
// brute-force/credential-stuffing signal, not a guess.
export async function recordFailedLogin(ipAddress, email) {
  if (!ipAddress || ipAddress === 'unknown') return;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM login_attempts
     WHERE ip_address = $1 AND success = FALSE AND created_at > now() - ($2 || ' minutes')::interval`,
    [ipAddress, AUTO_BLOCK_WINDOW_MINUTES]
  );
  const count = rows[0]?.count || 0;
  if (count === AUTO_BLOCK_FAILED_LOGIN_THRESHOLD) {
    await recordSecurityEvent({
      eventType: 'brute_force_detected', severity: 4, ipAddress,
      summary: `${count} failed logins from ${ipAddress} in ${AUTO_BLOCK_WINDOW_MINUTES} minutes.`,
      metadata: { email, windowMinutes: AUTO_BLOCK_WINDOW_MINUTES },
    });
    await autoBlockIp(ipAddress, `${count} failed logins within ${AUTO_BLOCK_WINDOW_MINUTES} minutes`);
  }
}

// Called from the rate-limit handlers in server.js on every rejection.
export async function recordRateLimitBlock(ipAddress, requestPath) {
  if (!ipAddress || ipAddress === 'unknown') return;
  await recordSecurityEvent({
    eventType: 'rate_limit_blocked', severity: 2, ipAddress, requestPath,
    summary: `Rate limit exceeded on ${requestPath}.`,
  });
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM security_events
     WHERE event_type = 'rate_limit_blocked' AND ip_address = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
    [ipAddress, AUTO_BLOCK_WINDOW_MINUTES]
  );
  const count = rows[0]?.count || 0;
  if (count === AUTO_BLOCK_RATE_LIMIT_THRESHOLD) {
    await autoBlockIp(ipAddress, `${count} rate-limit violations within ${AUTO_BLOCK_WINDOW_MINUTES} minutes`);
  }
}
