// Jedida AI Handler — guard rails.
//
// Every AI Handler endpoint (aiHandlerController.js) routes through this
// module for two things:
//   1. Subscription/feature gating — does this business's plan include
//      the capability the endpoint is about to use?
//   2. AI SECURITY RULES — a hard allow-list of what the AI Handler is
//      ever permitted to do, enforced in code (not just prompted around),
//      so a subscription can never grant the AI a forbidden action.
// Every AI Handler action, allowed or blocked, is logged through
// logAiHandlerAction -> platform_security_log (schema_phase43), reusing
// the single write path in securityLogService.js rather than a second
// logging table.

import { query } from '../config/db.js';
import { logSecurityEvent } from './securityLogService.js';

// ---------------------------------------------------------------------------
// Forbidden actions — the AI Handler must NEVER be able to do these,
// regardless of subscription plan, admin config, or caller input. Kept as
// an explicit list (rather than "everything not on an allow-list") so it
// reads as a direct mirror of the "AI SECURITY RULES" spec.
// ---------------------------------------------------------------------------
const FORBIDDEN_AI_ACTIONS = new Set([
  'accept_payment',
  'create_order',
  'approve_refund',
  'change_price_without_approval',
  'promise_unavailable_product',
  'move_customer_off_platform',
]);

export function assertAiActionAllowed(actionType) {
  if (FORBIDDEN_AI_ACTIONS.has(actionType)) {
    const err = new Error(`The Jedida AI Handler is not permitted to perform "${actionType}". This requires a human (the business owner, a Market Representative, or Jedida Admin) acting inside Jedida.`);
    err.statusCode = 403;
    err.code = 'AI_ACTION_FORBIDDEN';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Subscription lookup
// ---------------------------------------------------------------------------

export async function getActiveSubscription(businessUserId) {
  const result = await query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name, p.features, p.staff_seat_limit
     FROM ai_handler_subscriptions s
     JOIN ai_handler_plans p ON p.id = s.plan_id
     WHERE s.business_user_id = $1 AND s.status = 'active'
     LIMIT 1`,
    [businessUserId]
  );
  const sub = result.rows[0];
  if (!sub) return null;
  // Lazily expire — a subscription past its period end is treated as
  // inactive without needing a cron job to flip the row first.
  if (new Date(sub.current_period_end) < new Date()) return null;
  return sub;
}

// Throws a 402-style error if the business has no active subscription, or
// its plan doesn't include the requested feature flag. Returns the
// subscription row on success so callers can reuse it (e.g. for seat
// limits) without a second query.
export async function requireFeature(businessUserId, featureKey) {
  const sub = await getActiveSubscription(businessUserId);
  if (!sub) {
    const err = new Error('This business does not have an active Jedida AI Handler subscription.');
    err.statusCode = 402;
    err.code = 'NO_AI_HANDLER_SUBSCRIPTION';
    throw err;
  }
  if (featureKey && !sub.features?.[featureKey]) {
    const err = new Error(`Your "${sub.plan_name}" plan does not include this AI Handler feature. Upgrade your plan to unlock it.`);
    err.statusCode = 403;
    err.code = 'FEATURE_NOT_IN_PLAN';
    throw err;
  }
  return sub;
}

// ---------------------------------------------------------------------------
// Logging — every AI Handler action, whether it succeeded or was blocked.
// ---------------------------------------------------------------------------

export async function logAiHandlerAction({ businessUserId, actionType, initiatedBy = 'ai', actorId = null, outcome = 'allowed', metadata = {} }) {
  await logSecurityEvent(null, {
    actorId,
    actorRole: 'ai_handler',
    eventType: `ai_handler_${actionType}`,
    entityType: 'business',
    entityId: businessUserId,
    metadata: { initiatedBy, outcome, ...metadata },
  });
}
