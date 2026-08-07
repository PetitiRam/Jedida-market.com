// PETITI Response Engine — turns a detected threat (from
// petitiSecurityEngine.js's scans, or any other caller) into a *contained*
// one, at the tier the risk score actually warrants.
//
// Every function here follows the same boundary petitiService.js already
// established for PETITI's site-editing powers: PETITI gets a well-defined,
// reversible surface (flag / restrict / freeze an account, revoke its
// sessions, block an IP, propose stronger auth policy) — never destructive,
// unbounded, or silent. Nothing here deletes data, bans anyone permanently,
// or touches source code. Every containment action is written through
// recordAction() (ai_actions) and logSecurityEvent() (platform_security_log)
// in the same call, so "what happened / when / to whom / why" is always
// answerable from data already in the schema — no parallel incident table.
//
// Escalating tiers (Low / Medium / High) map directly onto Section 2 of the
// spec. "Automatic" here means PETITI can call these without a human in the
// loop for containment — but every action is reviewable afterwards
// (ai_actions + platform_security_log), and lifting a restriction/freeze or
// exiting emergency mode always requires an admin id (see liftSecurityState
// and exitEmergencyMode) — PETITI can lock a door, it can't unlock one.

import { query } from '../../src/config/db.js';
import { log, createAlert, recordAction } from './petitiService.js';
import { logSecurityEvent } from '../../src/services/securityLogService.js';

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

// Same 0-100 scale petitiSecurityEngine.js's scans already produce (its
// existing "critical alert" threshold is 70, folded into the 'high' band
// here rather than introduced as a second scale).
export function classifyRisk(riskScore) {
  const score = Number(riskScore) || 0;
  if (score >= 80) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Containment primitives — each one is a single, auditable, reversible step.
// ---------------------------------------------------------------------------

async function setSecurityState(userId, state, reason) {
  const result = await query(
    `UPDATE users
     SET security_state = $2, security_state_reason = $3,
         security_state_set_at = now(), security_state_set_by = 'petiti'
     WHERE id = $1 RETURNING id, security_state`,
    [userId, state, reason]
  );
  return result.rows[0] || null;
}

export async function revokeAllSessions(userId, reason) {
  const result = await query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE RETURNING id`,
    [userId]
  );
  await recordAction({ actor: 'petiti', actionType: 'revoke_sessions', payload: { userId, reason, sessionsRevoked: result.rows.length }, status: 'executed' });
  await logSecurityEvent(null, { actorId: null, actorRole: 'petiti', eventType: 'sessions_revoked', entityType: 'user', entityId: userId, metadata: { reason, sessionsRevoked: result.rows.length } });
  return result.rows.length;
}

export async function suspendAccount(userId, reason) {
  await query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [userId]);
  await recordAction({ actor: 'petiti', actionType: 'suspend_account', payload: { userId, reason }, status: 'executed' });
  await logSecurityEvent(null, { actorId: null, actorRole: 'petiti', eventType: 'account_suspended', entityType: 'user', entityId: userId, metadata: { reason } });
}

// Forces a password reset before the account can sign in again — reuses
// the same must_change_password flag the Partner Portal already checks
// (schema_phase33_partner_portal.sql), now also enforced by the main
// login() flow (authController.js). Also revokes every existing session,
// since a credential worth resetting is a credential worth not trusting
// the current tokens for either. `triggeredBy` lets an admin call this
// manually (see the /security/state/:userId/require-password-reset route)
// as well as PETITI calling it automatically from respondToThreat.
export async function requirePasswordReset(userId, reason, triggeredBy = 'petiti') {
  await query(
    `UPDATE users SET must_change_password = TRUE, must_change_password_reason = $2 WHERE id = $1`,
    [userId, reason]
  );
  const revoked = await revokeAllSessions(userId, reason);
  await recordAction({ actor: triggeredBy, actionType: 'require_password_reset', payload: { userId, reason, sessionsRevoked: revoked }, status: 'executed' });
  await logSecurityEvent(null, {
    actorId: triggeredBy === 'petiti' ? null : triggeredBy, actorRole: triggeredBy === 'petiti' ? 'petiti' : 'admin',
    eventType: 'password_reset_required', entityType: 'user', entityId: userId, metadata: { reason }
  });
}

export async function blockIp(ip, reason, blockedBy = 'petiti') {
  await query(
    `INSERT INTO blocked_ips (ip, reason, blocked_by) VALUES ($1,$2,$3)
     ON CONFLICT (ip) DO UPDATE SET reason = $2, blocked_by = $3, blocked_at = now(), unblocked_at = NULL, unblocked_by = NULL`,
    [ip, reason, blockedBy]
  );
  await recordAction({ actor: 'petiti', actionType: 'block_ip', payload: { ip, reason }, status: 'executed' });
  await logSecurityEvent(null, { actorId: null, actorRole: 'petiti', eventType: 'ip_blocked', entityType: 'ip', entityId: null, metadata: { ip, reason } });
}

export async function isIpBlocked(ip) {
  const result = await query(`SELECT 1 FROM blocked_ips WHERE ip = $1 AND unblocked_at IS NULL`, [ip]);
  return result.rows.length > 0;
}

// Admin-only unblock — adminUserId is required so the caller (the security
// route) can enforce requireAdmin before this ever runs.
export async function unblockIp(ip, adminUserId) {
  if (!adminUserId) throw new Error('unblockIp requires an admin user id.');
  await query(`UPDATE blocked_ips SET unblocked_at = now(), unblocked_by = $2 WHERE ip = $1`, [ip, adminUserId]);
  await logSecurityEvent(null, { actorId: adminUserId, actorRole: 'admin', eventType: 'ip_unblocked', entityType: 'ip', entityId: null, metadata: { ip } });
}

// Admin-only — mirrors unblockIp. PETITI can move an account INTO
// flagged/restricted/frozen automatically; only an admin moves it back.
export async function liftSecurityState(userId, adminUserId) {
  if (!adminUserId) throw new Error('liftSecurityState requires an admin user id.');
  await query(
    `UPDATE users SET security_state = 'normal', security_state_reason = NULL,
       security_state_set_at = now(), security_state_set_by = $2 WHERE id = $1`,
    [userId, String(adminUserId)]
  );
  // Lifting a freeze only clears the security hold, not a suspension an
  // admin applied for an unrelated reason — so account_status is left
  // alone here; reactivating account_status is a separate, explicit admin
  // action (AdminUsersPanel already covers this).
  await recordAction({ actor: 'petiti', actionType: 'lift_security_state', payload: { userId, adminUserId }, status: 'executed' });
  await logSecurityEvent(null, { actorId: adminUserId, actorRole: 'admin', eventType: 'security_state_lifted', entityType: 'user', entityId: userId, metadata: {} });
}

// ---------------------------------------------------------------------------
// The tiered automated response — this is the piece the spec calls out as
// the difference between "reports problems" and "takes action".
// ---------------------------------------------------------------------------

/**
 * respondToThreat — call this from any detector (petitiSecurityEngine.js's
 * scans, the auth layer, chat moderation, etc.) once a risk score has been
 * computed. Contains the threat at the matching tier and returns what it
 * did, so the caller (and the admin dashboard) can show it immediately.
 */
export async function respondToThreat({ category, riskScore, subjectUserId, ip, details, evidence = {} }) {
  const tier = classifyRisk(riskScore);
  const actionsTaken = [];

  // Always: record + alert, regardless of tier — the report itself is
  // never skipped, only the containment response scales with risk.
  await log('petiti', tier === 'high' ? 'error' : tier === 'medium' ? 'warn' : 'info', 'security',
    `[${tier}] ${category}: ${details}`, { riskScore, subjectUserId, ip, evidence });

  if (tier === 'low') {
    if (subjectUserId) {
      await setSecurityState(subjectUserId, 'flagged', details);
      actionsTaken.push('flagged_for_verification');
    }
    await createAlert({ actor: 'petiti', severity: 'low', title: `${category.replace(/_/g, ' ')} — additional verification requested`, description: details, relatedUserId: subjectUserId, metadata: { riskScore, evidence } });
    actionsTaken.push('logged', 'monitoring_increased');
  }

  if (tier === 'medium') {
    if (subjectUserId) {
      await setSecurityState(subjectUserId, 'restricted', details);
      await requirePasswordReset(subjectUserId, details);
      actionsTaken.push('sensitive_actions_restricted', 'password_reset_required');
    }
    await createAlert({ actor: 'petiti', severity: 'high', title: `${category.replace(/_/g, ' ')} — account restricted pending review`, description: details, relatedUserId: subjectUserId, metadata: { riskScore, evidence } });
    actionsTaken.push('admins_alerted');
  }

  if (tier === 'high') {
    if (subjectUserId) {
      await setSecurityState(subjectUserId, 'frozen', details);
      await suspendAccount(subjectUserId, details);
      await requirePasswordReset(subjectUserId, details);
      const revoked = await revokeAllSessions(subjectUserId, details);
      actionsTaken.push('account_frozen', 'account_suspended', 'password_reset_required', `sessions_revoked:${revoked}`);
    }
    if (ip) {
      await blockIp(ip, details);
      actionsTaken.push('ip_blocked');
    }
    await createAlert({ actor: 'petiti', severity: 'critical', title: `${category.replace(/_/g, ' ')} — security lockdown initiated`, description: details, relatedUserId: subjectUserId, metadata: { riskScore, evidence } });
    actionsTaken.push('evidence_preserved', 'security_admins_alerted');
  }

  await logSecurityEvent(null, {
    actorId: null, actorRole: 'petiti', eventType: `threat_response_${tier}`,
    entityType: 'user', entityId: subjectUserId || null,
    metadata: { category, riskScore, ip, actionsTaken },
  });

  return { tier, actionsTaken };
}

// ---------------------------------------------------------------------------
// Access Control Guardian — checked before any AI-assisted or AI-initiated
// action that touches another account's data or an admin-only function.
// This never GRANTS access; it only confirms the actor already has it, and
// logs+blocks when they don't. Mirrors aiHandlerGuard.js's
// assertAiActionAllowed pattern (hard allow-list, not a prompt-level rule).
// ---------------------------------------------------------------------------

const ADMIN_ONLY_ACTIONS = new Set([
  'view_any_user_pii', 'modify_platform_settings', 'approve_withdrawal',
  'change_user_role', 'access_admin_dashboard', 'override_security_state',
]);

/**
 * assertAccessAllowed — throws a 403-style error (statusCode + code, same
 * shape aiHandlerGuard.js uses) if `actor` isn't entitled to `actionType`
 * on `resourceOwnerId`. Every denial is logged as an unauthorized-access
 * attempt, not just silently rejected.
 */
export async function assertAccessAllowed({ actor, actionType, resourceOwnerId }) {
  const isSelf = resourceOwnerId && actor?.id === resourceOwnerId;
  const isAdmin = !!actor?.isAdmin;

  const needsAdmin = ADMIN_ONLY_ACTIONS.has(actionType) || (resourceOwnerId && !isSelf);

  if (needsAdmin && !isAdmin) {
    await logSecurityEvent(null, {
      actorId: actor?.id || null, actorRole: actor?.role || 'unknown',
      eventType: 'unauthorized_access_attempt', entityType: 'user', entityId: resourceOwnerId || null,
      metadata: { actionType },
    });
    await createAlert({
      actor: 'petiti', severity: 'high', title: 'Unauthorized access attempt blocked',
      description: `${actor?.role || 'unknown'} account ${actor?.id || '(unauthenticated)'} attempted "${actionType}"${resourceOwnerId ? ` on account ${resourceOwnerId}` : ''} without permission.`,
      relatedUserId: actor?.id, metadata: { actionType, resourceOwnerId },
    });
    const err = new Error('Unauthorized access attempt detected. Action blocked and security event logged.');
    err.statusCode = 403;
    err.code = 'ACCESS_DENIED';
    throw err;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Emergency mode — platform-wide lockdown. Entering can be automatic;
// exiting cannot (see the adminUserId requirement + the requireSuperAdmin
// gate expected at the route layer, matching the schema comment).
// ---------------------------------------------------------------------------

export async function enterEmergencyMode(reason, triggeredBy = 'petiti') {
  await query(
    `UPDATE platform_settings SET emergency_mode = TRUE, emergency_mode_reason = $1,
       emergency_mode_enabled_at = now(), emergency_mode_enabled_by = $2 WHERE id = 1`,
    [reason, triggeredBy]
  );
  await recordAction({ actor: 'petiti', actionType: 'enter_emergency_mode', payload: { reason, triggeredBy }, status: 'executed' });
  await createAlert({ actor: 'petiti', severity: 'critical', title: 'Emergency mode activated', description: reason, metadata: {} });
  await logSecurityEvent(null, { actorId: null, actorRole: triggeredBy, eventType: 'emergency_mode_entered', entityType: 'platform', entityId: null, metadata: { reason } });
}

export async function exitEmergencyMode(adminUserId) {
  if (!adminUserId) throw new Error('exitEmergencyMode requires an admin user id — this cannot be called unattended.');
  await query(
    `UPDATE platform_settings SET emergency_mode = FALSE, emergency_mode_reason = NULL,
       emergency_mode_enabled_at = NULL, emergency_mode_enabled_by = NULL WHERE id = 1`
  );
  await recordAction({ actor: 'petiti', actionType: 'exit_emergency_mode', payload: { adminUserId }, status: 'executed' });
  await logSecurityEvent(null, { actorId: adminUserId, actorRole: 'admin', eventType: 'emergency_mode_exited', entityType: 'platform', entityId: null, metadata: {} });
}

// ---------------------------------------------------------------------------
// Dashboard reads — Security Command Centre (spec section 7).
// ---------------------------------------------------------------------------

export async function listSecurityHolds({ state } = {}) {
  const values = [];
  let where = `security_state <> 'normal'`;
  if (state) { where = `security_state = $1`; values.push(state); }
  const result = await query(
    `SELECT id, email, full_name, primary_role, status, security_state,
            security_state_reason, security_state_set_at
     FROM users WHERE ${where}
     ORDER BY security_state_set_at DESC NULLS LAST LIMIT 200`,
    values
  );
  return result.rows;
}

export async function listBlockedIps() {
  const result = await query(
    `SELECT ip, reason, blocked_by, blocked_at FROM blocked_ips
     WHERE unblocked_at IS NULL ORDER BY blocked_at DESC LIMIT 200`
  );
  return result.rows;
}

// Rolled up counts for the Command Centre's top-line numbers — one query
// per figure, kept simple/readable over a single mega-query since this
// runs on-demand from an admin page load, not in a hot path.
export async function getSecurityCommandCenterSummary() {
  const [holds, blockedIps, emergencyMode, recentActions] = await Promise.all([
    query(`SELECT security_state, COUNT(*)::int AS count FROM users WHERE security_state <> 'normal' GROUP BY security_state`),
    query(`SELECT COUNT(*)::int AS count FROM blocked_ips WHERE unblocked_at IS NULL`),
    getEmergencyModeStatus(),
    query(`SELECT action_type, COUNT(*)::int AS count FROM ai_actions WHERE actor = 'petiti' AND created_at > now() - interval '7 days' GROUP BY action_type ORDER BY count DESC`),
  ]);
  const holdCounts = { flagged: 0, restricted: 0, frozen: 0 };
  for (const row of holds.rows) holdCounts[row.security_state] = row.count;
  return {
    accountsUnderHold: holdCounts,
    activeIpBlocks: blockedIps.rows[0].count,
    emergencyMode,
    actionsLast7Days: recentActions.rows,
  };
}

export async function getEmergencyModeStatus() {
  const result = await query(`SELECT emergency_mode, emergency_mode_reason, emergency_mode_enabled_at, emergency_mode_enabled_by FROM platform_settings WHERE id = 1`);
  return result.rows[0] || { emergency_mode: false };
}

// Express middleware — blocks a route entirely while emergency mode is on.
// Not wired into every route by default (that's a per-route decision for
// whoever owns each controller); attach it to specific sensitive routes,
// e.g. `router.post('/withdrawals', requireEmergencyModeOff, ...)`.
export function requireEmergencyModeOff(featureLabel = 'this feature') {
  return async (req, res, next) => {
    const status = await getEmergencyModeStatus();
    if (status.emergency_mode) {
      return res.status(503).json({ error: `${featureLabel} is temporarily unavailable — the platform is in emergency security lockdown.`, emergencyMode: true });
    }
    next();
  };
}
