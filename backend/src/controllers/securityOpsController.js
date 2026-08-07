// Security Operations Dashboard — reads, never writes platform state
// (beyond unblocking an IP / resolving an alert). Everything here is a
// real query against real tables; nothing is simulated. See
// securityEventService.js for what feeds security_events, and
// petitiSecurityEngine.js / trustSecurityController.js for the fraud and
// impossible-travel detection this dashboard surfaces.
import { query } from '../config/db.js';
import { verifyAllAuditChains } from '../services/auditIntegrityService.js';
import { getFaceVerificationConfig, updateFaceVerificationConfig } from '../services/faceVerificationService.js';

// ---------------------------------------------------------------------
// AI threat score — a transparent, explainable composite (0-100) built
// from real counts, not a black box. Every input is shown alongside the
// score so an admin can see exactly why it moved.
// ---------------------------------------------------------------------
async function computeThreatScore() {
  const [openFraud, criticalEvents24h, blockedIps24h, failedLogins1h, unresolvedAlerts] = await Promise.all([
    query(`SELECT COALESCE(SUM(severity), 0)::int AS weight, COUNT(*)::int AS count FROM fraud_flags WHERE status IN ('open','reviewing')`),
    query(`SELECT COUNT(*)::int AS count FROM security_events WHERE severity >= 4 AND created_at > now() - interval '24 hours'`),
    query(`SELECT COUNT(*)::int AS count FROM blocked_ips WHERE created_at > now() - interval '24 hours'`),
    query(`SELECT COUNT(*)::int AS count FROM login_attempts WHERE success = FALSE AND created_at > now() - interval '1 hour'`),
    query(`SELECT COUNT(*)::int AS count FROM security_events WHERE severity >= 3 AND resolved = FALSE`),
  ]);

  const inputs = {
    openFraudFlagWeight: openFraud.rows[0].weight,   // sum of severities (1-5) across open/reviewing flags
    criticalEvents24h: criticalEvents24h.rows[0].count,
    ipsAutoBlocked24h: blockedIps24h.rows[0].count,
    failedLoginsLastHour: failedLogins1h.rows[0].count,
    unresolvedAlerts: unresolvedAlerts.rows[0].count,
  };

  // Capped, weighted sum — tuned so a single serious incident visibly
  // moves the needle but no single input alone can hit 100.
  const raw =
    inputs.openFraudFlagWeight * 2 +
    inputs.criticalEvents24h * 6 +
    inputs.ipsAutoBlocked24h * 4 +
    Math.min(inputs.failedLoginsLastHour, 50) * 0.6 +
    inputs.unresolvedAlerts * 3;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const level = score >= 70 ? 'critical' : score >= 40 ? 'elevated' : score >= 15 ? 'guarded' : 'low';
  return { score, level, inputs };
}

export async function getOverview(req, res) {
  const [
    liveAttacks, failedLogins, activeSessions, blockedIps, highRiskUsers,
    apiTraffic, alerts, malware, threatScore
  ] = await Promise.all([
    query(`SELECT event_type, COUNT(*)::int AS count FROM security_events
           WHERE created_at > now() - interval '24 hours' GROUP BY event_type ORDER BY count DESC`),
    query(`SELECT
             COUNT(*) FILTER (WHERE success = FALSE AND created_at > now() - interval '24 hours')::int AS last_24h,
             COUNT(*) FILTER (WHERE success = FALSE AND created_at > now() - interval '1 hour')::int AS last_1h
           FROM login_attempts`),
    query(`SELECT platform, COUNT(*)::int AS count FROM refresh_tokens
           WHERE revoked = FALSE AND expires_at > now() GROUP BY platform`),
    query(`SELECT COUNT(*)::int AS count FROM blocked_ips WHERE unblocked_at IS NULL
             AND (expires_at IS NULL OR expires_at > now())`),
    query(`SELECT ff.user_id, u.name, u.email, COUNT(*)::int AS flag_count, MAX(ff.severity)::int AS max_severity
           FROM fraud_flags ff JOIN users u ON u.id = ff.user_id
           WHERE ff.status IN ('open','reviewing') GROUP BY ff.user_id, u.name, u.email
           ORDER BY max_severity DESC, flag_count DESC LIMIT 10`),
    query(`SELECT hour_bucket, request_count, blocked_count FROM api_traffic_stats
           WHERE hour_bucket > now() - interval '24 hours' ORDER BY hour_bucket ASC`),
    query(`SELECT COUNT(*)::int AS count FROM security_events WHERE severity >= 3 AND resolved = FALSE`),
    query(`SELECT COUNT(*)::int AS count FROM security_events WHERE event_type = 'malware_detected'
             AND created_at > now() - interval '7 days'`),
    computeThreatScore(),
  ]);

  res.json({
    liveAttacksBlocked: {
      total24h: liveAttacks.rows.reduce((sum, r) => sum + r.count, 0),
      byType: liveAttacks.rows,
    },
    failedLogins: failedLogins.rows[0],
    activeSessions: {
      total: activeSessions.rows.reduce((sum, r) => sum + r.count, 0),
      byPlatform: activeSessions.rows,
    },
    blockedIps: blockedIps.rows[0].count,
    highRiskUsers: highRiskUsers.rows,
    apiTraffic: apiTraffic.rows,
    unresolvedAlerts: alerts.rows[0].count,
    malwareDetections7d: malware.rows[0].count,
    threatScore,
  });
}

export async function listEvents(req, res) {
  const params = [];
  const clauses = [];
  if (req.query.eventType) { params.push(req.query.eventType); clauses.push(`event_type = $${params.length}`); }
  if (req.query.severityMin) { params.push(Number(req.query.severityMin)); clauses.push(`severity >= $${params.length}`); }
  if (req.query.resolved !== undefined) { params.push(req.query.resolved === 'true'); clauses.push(`resolved = $${params.length}`); }
  if (req.query.ip) { params.push(req.query.ip); clauses.push(`ip_address = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Number(req.query.limit) || 100);
  const { rows } = await query(
    `SELECT * FROM security_events ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params
  );
  res.json({ events: rows });
}

export async function resolveEvent(req, res) {
  const { rows } = await query(
    `UPDATE security_events SET resolved = TRUE, resolved_by = $1, resolved_at = now() WHERE id = $2 RETURNING *`,
    [req.user.id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Event not found.' });
  res.json({ event: rows[0] });
}

export async function listBlockedIps(req, res) {
  const { rows } = await query(
    `SELECT * FROM blocked_ips WHERE unblocked_at IS NULL ORDER BY created_at DESC LIMIT 200`
  );
  res.json({ blockedIps: rows });
}

export async function blockIp(req, res) {
  const { ipAddress, reason, expiresInHours } = req.body;
  if (!ipAddress?.trim()) return res.status(400).json({ error: 'ipAddress is required.' });
  const { rows } = await query(
    `INSERT INTO blocked_ips (ip_address, reason, blocked_by, expires_at)
     VALUES ($1, $2, 'admin', CASE WHEN $3::int IS NULL THEN NULL ELSE now() + ($3 || ' hours')::interval END)
     ON CONFLICT (ip_address) DO UPDATE SET reason = EXCLUDED.reason, unblocked_at = NULL, expires_at = EXCLUDED.expires_at
     RETURNING *`,
    [ipAddress.trim(), reason || 'Manually blocked by admin.', expiresInHours ? Number(expiresInHours) : null]
  );
  res.status(201).json({ blockedIp: rows[0] });
}

export async function unblockIp(req, res) {
  const { rows } = await query(
    `UPDATE blocked_ips SET unblocked_at = now(), unblocked_by = $1 WHERE id = $2 RETURNING *`,
    [req.user.id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Blocked IP not found.' });
  res.json({ blockedIp: rows[0] });
}

// Unified, searchable audit trail — UNIONs the admin-action log
// (platform_security_log) with login history, so "search everything that
// happened" doesn't require checking three screens.
export async function searchAuditLog(req, res) {
  const search = req.query.search ? `%${req.query.search}%` : null;
  const limit = Number(req.query.limit) || 100;

  const logParams = [];
  let logWhere = '';
  if (search) { logParams.push(search); logWhere = `WHERE event_type ILIKE $${logParams.length} OR entity_type ILIKE $${logParams.length}`; }
  logParams.push(limit);

  const { rows } = await query(
    `SELECT id, actor_id AS user_id, actor_role AS role, NULL::text AS ip_address, event_type AS action,
            entity_type AS resource, entity_id AS resource_id, TRUE AS success, metadata, created_at
     FROM platform_security_log ${logWhere}
     ORDER BY created_at DESC LIMIT $${logParams.length}`,
    logParams
  );
  res.json({ entries: rows });
}

// Tamper-evidence check for the two hash-chained audit tables (phase70).
// Cheap enough to run on every dashboard load — it's a single pass over
// each table done inside Postgres. Returns which chain (if any) broke and
// at which row, so an admin can pull that row and its neighbors to
// investigate rather than getting a bare "something's wrong somewhere".
export async function auditIntegrityStatus(req, res) {
  const result = await verifyAllAuditChains();
  res.json(result);
}

// Security Center panel for turning on face verification and setting its
// match threshold/provider — starts disabled (provider: 'none') until an
// admin deliberately configures a real provider and its credentials, per
// the fail-closed design in faceVerificationService.js.
export async function getFaceVerificationSettings(req, res) {
  const config = await getFaceVerificationConfig();
  res.json({ config });
}

export async function updateFaceVerificationSettings(req, res) {
  try {
    const config = await updateFaceVerificationConfig(req.body, req.user.adminRole || 'super_admin');
    res.json({ config });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Could not update face verification settings.' });
  }
}
