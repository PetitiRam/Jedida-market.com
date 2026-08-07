// Jedida Trust Engine — computes the automatic Verified Shop badge.
//
// Replaces the old idea of shop "verification" (a manual admin-set tier
// for B2B business_profiles, and a static specs.verified_supplier flag
// nothing ever computed) with one continuously-recomputed engine that
// applies to every shop: retail sellers, manufacturers, suppliers,
// dropshippers, farmers — anyone with a row in `shops`.
//
// Every score below is a real, workable heuristic built from data that
// already exists in this schema (orders, shop_follows, reviews, disputes,
// fraud_flags, product_questions, withdrawal_requests). None of it is
// machine-learning-based — that refinement (real bot-detection, fake-
// review detection, fraud-risk modeling) is the explicitly deferred
// "AI Protection" phase (Phase C). This engine is the deterministic
// foundation that phase will plug into, via the *_score columns on
// shop_trust_metrics.
import { query } from '../config/db.js';
import { getSection } from './settingsService.js';
import { logSecurityEvent } from './securityLogService.js';
import { monitorQualityDecline, runProtectionSweep } from './aiProtectionService.js';

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));

async function getSettings() {
  const s = await getSection('verifiedShop');
  // Defensive defaults in case a field is missing from the stored JSONB
  // (e.g. an older row from before a new field was added).
  return {
    minCompletedOrders: s.minCompletedOrders ?? 500,
    minFollowers: s.minFollowers ?? 1000,
    minRealFollowerRatio: s.minRealFollowerRatio ?? 0.7,
    minTrustScore: s.minTrustScore ?? 70,
    weightReliability: s.weightReliability ?? 20,
    weightDelivery: s.weightDelivery ?? 20,
    weightQuality: s.weightQuality ?? 20,
    weightSatisfaction: s.weightSatisfaction ?? 20,
    weightResponseSpeed: s.weightResponseSpeed ?? 10,
    weightFraudRisk: s.weightFraudRisk ?? 10,
    recomputeIntervalMinutes: s.recomputeIntervalMinutes ?? 360,
    autoRevokeEnabled: s.autoRevokeEnabled !== false
  };
}

// ------------------------------------------------------------
// Raw metric collection — one round of queries per shop. Kept as plain
// SQL rather than an ORM so every number here is traceable back to a
// specific, auditable query (important for a trust/verification system).
// ------------------------------------------------------------
async function collectRawMetrics(shopId) {
  const shopResult = await query(
    `SELECT s.*, u.kyc_status, u.id AS owner_id
     FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = $1`,
    [shopId]
  );
  const shop = shopResult.rows[0];
  if (!shop) return null;

  const [
    orderCounts, followerRow, reviewRow, shopReviewRow,
    responseRow, disputeRow, fraudRow, businessProfileRow, payoutRow
  ] = await Promise.all([
    // 1. Completed Orders Requirement — only genuinely completed orders
    // count. An order that is 'completed' but has a confirmed fraud flag
    // against it, or a dispute that resolved in the buyer's favor
    // (resolved_refund), is excluded — it was never a clean, delivered sale.
    query(
      `SELECT
         COUNT(*) FILTER (WHERE o.status = 'completed'
           AND NOT EXISTS (SELECT 1 FROM fraud_flags ff WHERE ff.order_id = o.id AND ff.status = 'confirmed')
           AND NOT EXISTS (SELECT 1 FROM disputes d WHERE d.order_id = o.id AND d.status = 'resolved_refund')
         ) AS clean_completed,
         COUNT(*) FILTER (WHERE o.status = 'completed') AS raw_completed,
         COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE o.status = 'disputed') AS disputed,
         COUNT(*) FILTER (WHERE o.status = 'completed' AND o.delivery_confirmed = TRUE) AS delivered_confirmed,
         COUNT(*) AS total
       FROM orders o WHERE o.shop_id = $1`,
      [shopId]
    ),

    // 2. Customer Community Requirement — total followers, plus a
    // lightweight bot heuristic: a follow is "suspicious" when the
    // follower account was created within 3 days of following AND that
    // account has never placed a single order on the platform. Real
    // bot/fake-engagement detection is Phase C's job; this is the
    // deterministic floor it will sit on top of.
    query(
      `SELECT
         COUNT(*) AS follower_count,
         COUNT(*) FILTER (
           WHERE u.created_at >= sf.created_at - INTERVAL '3 days'
             AND NOT EXISTS (SELECT 1 FROM orders bo WHERE bo.buyer_id = sf.user_id)
         ) AS suspicious_count
       FROM shop_follows sf JOIN users u ON u.id = sf.user_id
       WHERE sf.shop_id = $1`,
      [shopId]
    ),

    // 3a. Product quality — average rating across the shop's products.
    query(
      `SELECT COALESCE(AVG(r.rating), 0) AS avg_rating, COUNT(r.id) AS count
       FROM product_reviews r JOIN products p ON p.id = r.product_id
       WHERE p.shop_id = $1`,
      [shopId]
    ),

    // 3b. Customer satisfaction — direct shop-level reviews (communication,
    // overall experience), separate from per-product quality.
    query(`SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS count FROM shop_reviews WHERE shop_id = $1`, [shopId]),

    // 3c. Response speed — buyer questions are admin-relayed to the
    // seller (product_questions.answered_at), so time-to-answer is a
    // real, already-tracked proxy for how responsive this seller is.
    query(
      `SELECT AVG(EXTRACT(EPOCH FROM (q.answered_at - q.created_at)) / 3600.0) AS avg_response_hours, COUNT(*) AS count
       FROM product_questions q JOIN products p ON p.id = q.product_id
       WHERE p.shop_id = $1 AND q.answered_at IS NOT NULL`,
      [shopId]
    ),

    // 3d (part of reliability) — disputes ratio.
    query(
      `SELECT COUNT(*) FILTER (WHERE d.status = 'resolved_refund') AS refund_losses, COUNT(*) AS total
       FROM disputes d JOIN orders o ON o.id = d.order_id WHERE o.shop_id = $1`,
      [shopId]
    ),

    // 3e. Fraud risk — confirmed fraud flags/reports against this shop's
    // orders or its owner in the last 180 days.
    query(
      `SELECT
         (SELECT COUNT(*) FROM fraud_flags ff JOIN orders o ON o.id = ff.order_id
            WHERE o.shop_id = $1 AND ff.status = 'confirmed' AND ff.created_at >= now() - INTERVAL '180 days') AS confirmed_flags,
         (SELECT COUNT(*) FROM fraud_reports fr
            WHERE fr.subject_user_id = (SELECT owner_id FROM shops WHERE id = $1)
              AND fr.status = 'confirmed' AND fr.created_at >= now() - INTERVAL '180 days') AS confirmed_reports`,
      [shopId]
    ),

    // 4a. Business profile requirement (KYC) — for B2B account types this
    // is the company-level verification; for a plain seller it's the
    // personal KYC on the user record.
    query(`SELECT status FROM business_profiles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [shop.owner_id]),

    // 4b. Valid payment information — proven by at least one successfully
    // paid-out withdrawal (a real, working payout destination), since
    // there's no separate stored "payout profile" in this schema.
    query(`SELECT COUNT(*) AS count FROM withdrawal_requests WHERE user_id = $1 AND status IN ('approved', 'paid')`, [shop.owner_id])
  ]);

  return {
    shop, orderCounts: orderCounts.rows[0], followerRow: followerRow.rows[0],
    reviewRow: reviewRow.rows[0], shopReviewRow: shopReviewRow.rows[0],
    responseRow: responseRow.rows[0], disputeRow: disputeRow.rows[0],
    fraudRow: fraudRow.rows[0], businessProfileRow: businessProfileRow.rows[0],
    payoutRow: payoutRow.rows[0]
  };
}

// ------------------------------------------------------------
// Turn raw metrics into the six Trust Engine sub-scores (0-100 each,
// fraud_risk_score is inverted — 0 is clean, 100 is high risk) plus the
// weighted composite trust_score.
// ------------------------------------------------------------
function scoreMetrics(raw, settings) {
  const oc = raw.orderCounts;
  const totalOrders = Number(oc.total);
  const cleanCompleted = Number(oc.clean_completed);
  const cancelled = Number(oc.cancelled);
  const disputedCount = Number(oc.disputed);

  // Reliability — completion rate net of cancellations/disputes, plus a
  // penalty for orders that resolved as refund losses.
  const decidedOrders = cleanCompleted + cancelled + disputedCount;
  const refundLosses = Number(raw.disputeRow.refund_losses);
  const disputeTotal = Number(raw.disputeRow.total) || 1;
  const reliabilityBase = decidedOrders > 0 ? (cleanCompleted / decidedOrders) * 100 : 0;
  const refundPenalty = (refundLosses / disputeTotal) * 30;
  const reliability_score = clamp(reliabilityBase - refundPenalty);

  // Delivery performance — share of completed orders with a confirmed
  // delivery (both buyer and seller/delivery-partner sign-off).
  const rawCompleted = Number(oc.raw_completed);
  const delivery_score = rawCompleted > 0 ? clamp((Number(oc.delivered_confirmed) / rawCompleted) * 100) : 0;

  // Product quality — average product rating, scaled to 0-100.
  const quality_score = clamp((Number(raw.reviewRow.avg_rating) / 5) * 100);

  // Customer satisfaction — direct shop reviews; falls back to product
  // quality when a shop has no shop-level reviews yet, so a shop isn't
  // penalized purely for that separate review channel being unused.
  const satisfaction_score = Number(raw.shopReviewRow.count) > 0
    ? clamp((Number(raw.shopReviewRow.avg_rating) / 5) * 100)
    : quality_score;

  // Response speed — faster average time-to-answer scores higher.
  // Under 2 hours = 100, over 48 hours = 0, linear between.
  const avgHours = raw.responseRow.avg_response_hours;
  const response_score = avgHours == null ? 0 : clamp(100 - ((Number(avgHours) - 2) / 46) * 100);

  // Fraud risk — 0 clean; each confirmed flag/report adds risk, capped.
  const confirmedSignals = Number(raw.fraudRow.confirmed_flags) + Number(raw.fraudRow.confirmed_reports);
  const fraud_risk_score = clamp(confirmedSignals * 20);

  const totalWeight = settings.weightReliability + settings.weightDelivery + settings.weightQuality
    + settings.weightSatisfaction + settings.weightResponseSpeed + settings.weightFraudRisk || 1;

  const trust_score = clamp((
    reliability_score * settings.weightReliability +
    delivery_score * settings.weightDelivery +
    quality_score * settings.weightQuality +
    satisfaction_score * settings.weightSatisfaction +
    response_score * settings.weightResponseSpeed +
    (100 - fraud_risk_score) * settings.weightFraudRisk
  ) / totalWeight);

  const followerCount = Number(raw.followerRow.follower_count);
  const suspiciousFollowerCount = Number(raw.followerRow.suspicious_count);
  const realFollowerCount = Math.max(0, followerCount - suspiciousFollowerCount);

  // Business profile requirement: a completed seller profile (logo,
  // banner, description, contact info all filled in), KYC (personal or
  // business-level, whichever applies to this account type), and proof
  // of valid payment information.
  const shop = raw.shop;
  const profile_complete = Boolean(shop.logo_url && shop.banner_url && shop.description && shop.contact_email && shop.contact_phone);
  const kyc_complete = raw.businessProfileRow
    ? raw.businessProfileRow.status === 'active'
    : shop.kyc_status === 'approved';
  const payment_verified = Number(raw.payoutRow.count) > 0;

  const meets_orders_requirement = cleanCompleted >= settings.minCompletedOrders;
  const meets_followers_requirement = followerCount >= settings.minFollowers
    && (followerCount === 0 || realFollowerCount / followerCount >= settings.minRealFollowerRatio);
  const meets_trust_requirement = trust_score >= settings.minTrustScore;
  const meets_profile_requirement = profile_complete && kyc_complete && payment_verified;

  return {
    completed_orders_count: cleanCompleted,
    follower_count: followerCount,
    suspicious_follower_count: suspiciousFollowerCount,
    real_follower_count: realFollowerCount,
    reliability_score, delivery_score, quality_score, satisfaction_score, response_score, fraud_risk_score, trust_score,
    profile_complete, kyc_complete, payment_verified,
    meets_orders_requirement, meets_followers_requirement, meets_trust_requirement, meets_profile_requirement,
    eligible: meets_orders_requirement && meets_followers_requirement && meets_trust_requirement && meets_profile_requirement
  };
}

async function persistMetrics(shopId, m) {
  await query(
    `INSERT INTO shop_trust_metrics (
       shop_id, completed_orders_count, follower_count, suspicious_follower_count, real_follower_count,
       reliability_score, delivery_score, quality_score, satisfaction_score, response_score, fraud_risk_score, trust_score,
       profile_complete, kyc_complete, payment_verified,
       meets_orders_requirement, meets_followers_requirement, meets_trust_requirement, meets_profile_requirement, eligible,
       last_computed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())
     ON CONFLICT (shop_id) DO UPDATE SET
       completed_orders_count = EXCLUDED.completed_orders_count,
       follower_count = EXCLUDED.follower_count,
       suspicious_follower_count = EXCLUDED.suspicious_follower_count,
       real_follower_count = EXCLUDED.real_follower_count,
       reliability_score = EXCLUDED.reliability_score,
       delivery_score = EXCLUDED.delivery_score,
       quality_score = EXCLUDED.quality_score,
       satisfaction_score = EXCLUDED.satisfaction_score,
       response_score = EXCLUDED.response_score,
       fraud_risk_score = EXCLUDED.fraud_risk_score,
       trust_score = EXCLUDED.trust_score,
       profile_complete = EXCLUDED.profile_complete,
       kyc_complete = EXCLUDED.kyc_complete,
       payment_verified = EXCLUDED.payment_verified,
       meets_orders_requirement = EXCLUDED.meets_orders_requirement,
       meets_followers_requirement = EXCLUDED.meets_followers_requirement,
       meets_trust_requirement = EXCLUDED.meets_trust_requirement,
       meets_profile_requirement = EXCLUDED.meets_profile_requirement,
       eligible = EXCLUDED.eligible,
       last_computed_at = now()`,
    [
      shopId, m.completed_orders_count, m.follower_count, m.suspicious_follower_count, m.real_follower_count,
      m.reliability_score, m.delivery_score, m.quality_score, m.satisfaction_score, m.response_score, m.fraud_risk_score, m.trust_score,
      m.profile_complete, m.kyc_complete, m.payment_verified,
      m.meets_orders_requirement, m.meets_followers_requirement, m.meets_trust_requirement, m.meets_profile_requirement, m.eligible
    ]
  );
}

async function recordEvent(shopId, eventType, { reason = null, actorType = 'system', actorId = null, metrics = {} } = {}) {
  await query(
    `INSERT INTO shop_verification_events (shop_id, event_type, reason, actor_type, actor_id, metrics_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [shopId, eventType, reason, actorType, actorId, JSON.stringify(metrics)]
  );
}

function missingRequirementsSummary(m, settings) {
  const gaps = [];
  if (!m.meets_orders_requirement) gaps.push(`${m.completed_orders_count}/${settings.minCompletedOrders} completed orders`);
  if (!m.meets_followers_requirement) gaps.push(`${m.real_follower_count}/${settings.minFollowers} real followers`);
  if (!m.meets_trust_requirement) gaps.push(`trust score ${m.trust_score.toFixed(1)}/${settings.minTrustScore}`);
  if (!m.meets_profile_requirement) {
    const parts = [];
    if (!m.profile_complete) parts.push('complete profile');
    if (!m.kyc_complete) parts.push('KYC');
    if (!m.payment_verified) parts.push('payment info');
    gaps.push(`business profile requirement (missing: ${parts.join(', ') || 'unknown'})`);
  }
  return gaps;
}

// ------------------------------------------------------------
// evaluateShop — the single entry point everything else calls. Computes
// fresh metrics, persists them, and applies the grant/revoke decision
// unless an admin override is in force.
// ------------------------------------------------------------
export async function evaluateShop(shopId) {
  const settings = await getSettings();
  const raw = await collectRawMetrics(shopId);
  if (!raw) return null;

  const m = scoreMetrics(raw, settings);
  await persistMetrics(shopId, m);

  const shop = raw.shop;

  if (shop.verification_mode === 'admin_forced_verified') {
    if (!shop.is_verified) {
      await query(`UPDATE shops SET is_verified = TRUE, verified_since = COALESCE(verified_since, now()) WHERE id = $1`, [shopId]);
    }
    return { ...m, isVerified: true, mode: 'admin_forced_verified' };
  }
  if (shop.verification_mode === 'admin_forced_blocked') {
    if (shop.is_verified) {
      await query(`UPDATE shops SET is_verified = FALSE WHERE id = $1`, [shopId]);
    }
    return { ...m, isVerified: false, mode: 'admin_forced_blocked' };
  }

  // Auto mode — the normal path.
  if (m.eligible && !shop.is_verified) {
    await query(`UPDATE shops SET is_verified = TRUE, verified_since = now() WHERE id = $1`, [shopId]);
    await recordEvent(shopId, 'granted', { metrics: m });
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1,'shop_verified','You''re a Verified Shop! ✓',$2,$3)`,
      [shop.owner_id, `Your shop "${shop.name}" now meets every Verified Shop requirement and shows the ✓ badge.`, JSON.stringify({ shopId })]
    );
    return { ...m, isVerified: true, mode: 'auto' };
  }

  if (!m.eligible && shop.is_verified) {
    if (!settings.autoRevokeEnabled) {
      return { ...m, isVerified: true, mode: 'auto', pendingRevoke: true };
    }
    const gaps = missingRequirementsSummary(m, settings);
    await query(`UPDATE shops SET is_verified = FALSE WHERE id = $1`, [shopId]);
    await recordEvent(shopId, 'revoked', { reason: `No longer meets: ${gaps.join('; ')}`, metrics: m });
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1,'shop_verification_revoked','Your Verified Shop badge was removed',$2,$3)`,
      [shop.owner_id, `Your shop "${shop.name}" no longer meets: ${gaps.join('; ')}.`, JSON.stringify({ shopId, gaps })]
    );
    return { ...m, isVerified: false, mode: 'auto' };
  }

  return { ...m, isVerified: shop.is_verified, mode: 'auto' };
}

// Sweep — recompute every shop that's actually live, so revocation
// (dropping below the minimum trust score, losing KYC status, etc.) is
// caught even when nothing about that specific shop just happened.
// Mirrors the escrow auto-release / agri contract sweep pattern already
// registered in server.js.
export async function evaluateAllActiveShops({ onEvaluated } = {}) {
  const shops = await query(`SELECT id FROM shops WHERE status = 'active'`);
  let checked = 0, granted = 0, revoked = 0;
  for (const row of shops.rows) {
    try {
      const before = await query('SELECT is_verified FROM shops WHERE id = $1', [row.id]);
      const wasVerified = before.rows[0]?.is_verified;
      const beforeMetrics = wasVerified ? await getShopTrustMetrics(row.id) : null;
      const result = await evaluateShop(row.id);
      checked += 1;
      if (result && result.isVerified && !wasVerified) granted += 1;
      if (result && !result.isVerified && wasVerified) revoked += 1;
      // Let a caller (AI Protection's sweep) react to the before/after
      // metrics without this service needing to import that one.
      if (onEvaluated) await onEvaluated({ shopId: row.id, wasVerified, beforeMetrics, result });
    } catch (err) {
      console.error(`Trust engine: failed to evaluate shop ${row.id}:`, err);
    }
  }
  return { checked, granted, revoked };
}

// Combined sweep — runs the Phase A/B trust engine (grant/revoke) and
// hooks Phase C's quality-decline monitor into each shop's before/after
// metrics, then runs the follower/review/order scans across every shop.
// This is the single function server.js schedules.
export async function runFullTrustAndProtectionSweep() {
  const engineSummary = await evaluateAllActiveShops({
    onEvaluated: async ({ shopId, wasVerified, beforeMetrics, result }) => {
      if (wasVerified && result && result.isVerified && beforeMetrics) {
        await monitorQualityDecline(shopId, beforeMetrics, result);
      }
    }
  });
  const protectionSummary = await runProtectionSweep();
  return { engineSummary, protectionSummary };
}
export async function setAdminOverride(shopId, mode, { reason, adminId }) {
  if (!['auto', 'admin_forced_verified', 'admin_forced_blocked'].includes(mode)) {
    throw new Error('Invalid override mode.');
  }
  const shopResult = await query('SELECT * FROM shops WHERE id = $1', [shopId]);
  const shop = shopResult.rows[0];
  if (!shop) throw new Error('Shop not found.');

  await query(
    `UPDATE shops SET verification_mode = $1, verification_override_reason = $2,
       verification_override_by = $3, verification_override_at = now() WHERE id = $4`,
    [mode, reason || null, adminId, shopId]
  );

  const eventType = mode === 'admin_forced_verified' ? 'admin_override_verified'
    : mode === 'admin_forced_blocked' ? 'admin_override_blocked'
    : 'admin_override_cleared';
  await recordEvent(shopId, eventType, { reason, actorType: 'admin', actorId: adminId });

  await logSecurityEvent(null, {
    actorId: adminId, actorRole: 'admin', eventType: 'shop_verification_override_changed',
    entityType: 'shop', entityId: shopId, metadata: { mode, reason }
  });

  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata)
     VALUES ($1,'shop_verification_override_changed','Your shop verification status was updated by an admin',$2,$3)`,
    [shop.owner_id, reason || `An admin changed your shop's verification mode to "${mode}".`, JSON.stringify({ shopId, mode })]
  );

  // Re-evaluate immediately so the badge reflects the new mode right away.
  return evaluateShop(shopId);
}

export async function getShopTrustMetrics(shopId) {
  const result = await query(
    `SELECT stm.*, s.is_verified, s.verified_since, s.verification_mode,
            s.verification_override_reason, s.verification_override_at
     FROM shop_trust_metrics stm JOIN shops s ON s.id = stm.shop_id WHERE stm.shop_id = $1`,
    [shopId]
  );
  return result.rows[0] || null;
}

export async function getVerifiedShopThresholds() {
  return getSettings();
}

export { missingRequirementsSummary };
