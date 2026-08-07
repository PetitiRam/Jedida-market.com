// AI Protection for the Verified Shop system (Phase C).
//
// This is deliberately rule-based and statistical, not a trained ML
// model — every check below is a documented heuristic an admin can read
// and reason about, operating on data the platform already collects
// (shop_follows, product_reviews/shop_reviews, orders, shop_trust_metrics).
// It sharpens what Phase A's trust engine already computes and gives
// admins a queue to review, rather than silently auto-punishing shops.
//
// Detected order-level issues are written into the existing fraud_flags
// table (so they show up in the admin Fraud & Disputes screen that
// already exists). Follower/review/quality issues don't fit that table
// (they're shop-scoped, not user/order-scoped) so they go into the new
// shop_risk_signals table instead.
import { query } from '../config/db.js';
import { getSection } from './settingsService.js';

async function getSettings() {
  const s = await getSection('aiProtection');
  return {
    burstFollowThreshold: s.burstFollowThreshold ?? 50,
    burstWindowHours: s.burstWindowHours ?? 24,
    reviewBurstCount: s.reviewBurstCount ?? 10,
    reviewBurstWindowHours: s.reviewBurstWindowHours ?? 48,
    orderVelocityMultiplier: s.orderVelocityMultiplier ?? 5,
    fastCompletionMinutes: s.fastCompletionMinutes ?? 10,
    qualityDeclineTrustDrop: s.qualityDeclineTrustDrop ?? 15,
    qualityDeclineFraudRiskThreshold: s.qualityDeclineFraudRiskThreshold ?? 40,
    signalCooldownDays: s.signalCooldownDays ?? 7
  };
}

// Don't re-raise the same kind of signal for a shop every sweep — only
// open a new one if there isn't already an unresolved one from the last
// `signalCooldownDays`.
async function hasRecentOpenSignal(shopId, signalType, cooldownDays) {
  const result = await query(
    `SELECT 1 FROM shop_risk_signals
     WHERE shop_id = $1 AND signal_type = $2 AND status = 'open' AND created_at >= now() - ($3 || ' days')::interval
     LIMIT 1`,
    [shopId, signalType, cooldownDays]
  );
  return result.rows.length > 0;
}

async function raiseSignal(shopId, signalType, severity, details) {
  const settings = await getSettings();
  if (await hasRecentOpenSignal(shopId, signalType, settings.signalCooldownDays)) return null;

  const inserted = await query(
    `INSERT INTO shop_risk_signals (shop_id, signal_type, severity, details) VALUES ($1,$2,$3,$4) RETURNING *`,
    [shopId, signalType, severity, JSON.stringify(details)]
  );

  const shop = (await query('SELECT owner_id, name FROM shops WHERE id = $1', [shopId])).rows[0];
  if (shop) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1,'shop_risk_signal_raised',$2,$3,$4)`,
      [
        shop.owner_id,
        'Your shop was flagged for review',
        `Our AI Protection system flagged "${shop.name}" for ${signalType.replace(/_/g, ' ')}. An admin will review it.`,
        JSON.stringify({ shopId, signalType })
      ]
    );
  }
  return inserted.rows[0];
}

// ------------------------------------------------------------
// 1. Fake followers — burst-growth detection. The trust engine (Phase A)
// already discounts individually-suspicious follows (new account, never
// ordered) from the follower count used for eligibility; this adds a
// second, independent check for *coordinated* growth: an unusually large
// number of follows landing in one short window, which a single new
// legitimate account's organic-growth pattern wouldn't produce.
// ------------------------------------------------------------
export async function scanShopFollowers(shopId) {
  const settings = await getSettings();

  // Mark (for admin visibility) which currently-recorded follows match
  // the new-account+never-ordered heuristic, without changing counts the
  // trust engine already relies on.
  await query(
    `UPDATE shop_follows sf SET ai_suspicious = TRUE
     FROM users u WHERE u.id = sf.user_id AND sf.shop_id = $1
       AND u.created_at >= sf.created_at - INTERVAL '3 days'
       AND NOT EXISTS (SELECT 1 FROM orders bo WHERE bo.buyer_id = sf.user_id)
       AND sf.ai_suspicious = FALSE`,
    [shopId]
  );

  const burst = await query(
    `SELECT date_trunc('hour', created_at) AS window_start, COUNT(*) AS follows
     FROM shop_follows WHERE shop_id = $1 AND created_at >= now() - ($2 || ' hours')::interval
     GROUP BY 1 HAVING COUNT(*) >= $3
     ORDER BY follows DESC LIMIT 1`,
    [shopId, settings.burstWindowHours, settings.burstFollowThreshold]
  );

  if (burst.rows.length > 0) {
    const { follows } = burst.rows[0];
    const severity = follows >= settings.burstFollowThreshold * 3 ? 5 : follows >= settings.burstFollowThreshold * 2 ? 4 : 3;
    return raiseSignal(shopId, 'fake_followers', severity, {
      followsInWindow: Number(follows), windowHours: settings.burstWindowHours, threshold: settings.burstFollowThreshold
    });
  }
  return null;
}

// ------------------------------------------------------------
// 2. Fake reviews — two independent checks:
//   a) a review with no matching completed order from that reviewer for
//      that product is flagged individually (unverified purchase).
//   b) a burst of reviews for this shop's products in a short window,
//      overwhelmingly from accounts posting their one and only review,
//      is raised as a shop-level signal (classic review-bombing/paid-
//      review pattern).
// ------------------------------------------------------------
export async function scanShopReviews(shopId) {
  const settings = await getSettings();

  await query(
    `UPDATE product_reviews r SET ai_flagged = TRUE, ai_flag_reason = 'No matching completed order found for this reviewer/product.'
     FROM products p WHERE p.id = r.product_id AND p.shop_id = $1 AND r.ai_flagged = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM orders o WHERE o.buyer_id = r.buyer_id AND o.product_id = r.product_id AND o.status = 'completed'
       )`,
    [shopId]
  );

  const burst = await query(
    `SELECT COUNT(*) AS burst_count, COUNT(*) FILTER (WHERE reviewer_total = 1) AS single_review_accounts
     FROM (
       SELECT r.id, r.buyer_id,
              (SELECT COUNT(*) FROM product_reviews r2 WHERE r2.buyer_id = r.buyer_id) AS reviewer_total
       FROM product_reviews r JOIN products p ON p.id = r.product_id
       WHERE p.shop_id = $1 AND r.created_at >= now() - ($2 || ' hours')::interval
     ) recent`,
    [shopId, settings.reviewBurstWindowHours]
  );
  const { burst_count: burstCount, single_review_accounts: singleReviewAccounts } = burst.rows[0];

  if (Number(burstCount) >= settings.reviewBurstCount && Number(singleReviewAccounts) / Math.max(1, Number(burstCount)) >= 0.6) {
    const severity = Number(burstCount) >= settings.reviewBurstCount * 2 ? 5 : 3;
    return raiseSignal(shopId, 'fake_reviews', severity, {
      reviewsInWindow: Number(burstCount), singleReviewAccounts: Number(singleReviewAccounts),
      windowHours: settings.reviewBurstWindowHours
    });
  }
  return null;
}

// ------------------------------------------------------------
// 3. Suspicious orders — written to fraud_flags (existing admin Fraud
// & Disputes queue), not shop_risk_signals:
//   a) a single buyer accounting for a disproportionate share of a
//      shop's completed orders (self-dealing / count-inflation risk)
//   b) orders "delivered" implausibly fast after payment
// ------------------------------------------------------------
export async function scanShopOrders(shopId) {
  const settings = await getSettings();
  const flagsRaised = [];

  const velocity = await query(
    `SELECT o.buyer_id, COUNT(*) AS buyer_orders,
            (SELECT COUNT(*) FROM orders o2 WHERE o2.shop_id = $1 AND o2.status = 'completed') AS shop_total,
            (SELECT COUNT(DISTINCT buyer_id) FROM orders o3 WHERE o3.shop_id = $1 AND o3.status = 'completed') AS distinct_buyers
     FROM orders o WHERE o.shop_id = $1 AND o.status = 'completed'
     GROUP BY o.buyer_id
     ORDER BY buyer_orders DESC LIMIT 1`,
    [shopId]
  );
  if (velocity.rows.length > 0) {
    const { buyer_id, buyer_orders, shop_total, distinct_buyers } = velocity.rows[0];
    const avgPerBuyer = Number(distinct_buyers) > 0 ? Number(shop_total) / Number(distinct_buyers) : 0;
    if (avgPerBuyer > 0 && Number(buyer_orders) >= avgPerBuyer * settings.orderVelocityMultiplier && Number(buyer_orders) >= 10) {
      const existing = await query(
        `SELECT id FROM fraud_flags WHERE user_id = $1 AND flag_type = 'suspicious_order_pattern' AND status = 'open'
           AND created_at >= now() - INTERVAL '7 days'`,
        [buyer_id]
      );
      if (existing.rows.length === 0) {
        const inserted = await query(
          `INSERT INTO fraud_flags (user_id, flag_type, severity, details, auto_detected)
           VALUES ($1,'suspicious_order_pattern',$2,$3,TRUE) RETURNING *`,
          [buyer_id, 4, JSON.stringify({ shopId, buyerOrders: Number(buyer_orders), shopTotal: Number(shop_total), avgPerBuyer })]
        );
        flagsRaised.push(inserted.rows[0]);
      }
    }
  }

  const fastCompletions = await query(
    `SELECT COUNT(*) AS count FROM orders
     WHERE shop_id = $1 AND status = 'completed' AND delivery_confirmed = TRUE
       AND updated_at <= created_at + ($2 || ' minutes')::interval
       AND created_at >= now() - INTERVAL '30 days'`,
    [shopId, settings.fastCompletionMinutes]
  );
  if (Number(fastCompletions.rows[0].count) >= 5) {
    const shop = (await query('SELECT owner_id FROM shops WHERE id = $1', [shopId])).rows[0];
    const existing = await query(
      `SELECT id FROM fraud_flags WHERE user_id = $1 AND flag_type = 'suspicious_order_pattern' AND status = 'open'
         AND details->>'pattern' = 'fast_completion' AND created_at >= now() - INTERVAL '7 days'`,
      [shop.owner_id]
    );
    if (existing.rows.length === 0) {
      const inserted = await query(
        `INSERT INTO fraud_flags (user_id, flag_type, severity, details, auto_detected)
         VALUES ($1,'suspicious_order_pattern',$2,$3,TRUE) RETURNING *`,
        [shop.owner_id, 3, JSON.stringify({ shopId, pattern: 'fast_completion', count: Number(fastCompletions.rows[0].count), thresholdMinutes: settings.fastCompletionMinutes })]
      );
      flagsRaised.push(inserted.rows[0]);
    }
  }

  return flagsRaised;
}

// ------------------------------------------------------------
// 4. Quality decline monitoring — for a shop that's currently verified,
// compare its metrics right before and right after a fresh recompute; a
// sharp trust-score drop or a jump in fraud risk raises a warning even
// though the shop may still clear the verification bar this cycle.
// Caller passes in the before/after metric rows so this stays a pure
// comparison function trustEngineService's sweep already has both of.
// ------------------------------------------------------------
export async function monitorQualityDecline(shopId, beforeMetrics, afterMetrics) {
  if (!beforeMetrics || !afterMetrics) return null;
  const settings = await getSettings();

  const trustDrop = Number(beforeMetrics.trust_score) - Number(afterMetrics.trust_score);
  const fraudRisky = Number(afterMetrics.fraud_risk_score) >= settings.qualityDeclineFraudRiskThreshold;

  if (trustDrop >= settings.qualityDeclineTrustDrop || fraudRisky) {
    const severity = fraudRisky ? 5 : trustDrop >= settings.qualityDeclineTrustDrop * 2 ? 4 : 3;
    return raiseSignal(shopId, 'quality_decline', severity, {
      trustScoreBefore: Number(beforeMetrics.trust_score), trustScoreAfter: Number(afterMetrics.trust_score),
      trustDrop, fraudRiskScore: Number(afterMetrics.fraud_risk_score)
    });
  }
  return null;
}

// ------------------------------------------------------------
// Seller-facing improvement suggestions — plain-language, rule-based
// tips derived from the weakest sub-scores in a shop's latest metrics.
// ------------------------------------------------------------
export function recommendImprovements(metrics) {
  if (!metrics) return [];
  const tips = [];
  if (metrics.reliability_score < 70) tips.push('Reduce cancellations and disputes — reliability is one of the most heavily-weighted trust factors.');
  if (metrics.delivery_score < 70) tips.push('Confirm deliveries promptly and make sure orders are actually reaching customers — your delivery performance score is low.');
  if (metrics.quality_score < 70) tips.push('Your average product rating is dragging down your quality score — consider improving product descriptions/photos to set accurate expectations.');
  if (metrics.satisfaction_score < 70) tips.push('Customers rating their overall shop experience lower than expected — check recent shop reviews for recurring complaints.');
  if (metrics.response_score < 70) tips.push('Answer buyer questions faster — response speed is scored from how quickly you reply to product questions.');
  if (Number(metrics.fraud_risk_score) > 20) tips.push('Recent fraud flags or disputes are raising your risk score — resolve open disputes and review recent orders for issues.');
  if (!metrics.profile_complete) tips.push('Complete your shop profile — add a logo, banner, description, and contact details.');
  if (!metrics.kyc_complete) tips.push('Finish your KYC verification to unlock the Verified Shop badge.');
  if (!metrics.payment_verified) tips.push('Complete at least one successful withdrawal to prove your payout details are valid.');
  if (Number(metrics.suspicious_follower_count) > 0) tips.push(`${metrics.suspicious_follower_count} of your followers look like bot/inactive accounts and won't count toward your follower requirement.`);
  return tips;
}

// ------------------------------------------------------------
// Full sweep across every active shop — run on the same cadence as the
// trust engine sweep (see server.js).
// ------------------------------------------------------------
export async function runProtectionSweep() {
  const shops = await query(`SELECT id FROM shops WHERE status = 'active'`);
  let signalsRaised = 0, flagsRaised = 0;
  for (const row of shops.rows) {
    try {
      const followerSignal = await scanShopFollowers(row.id);
      const reviewSignal = await scanShopReviews(row.id);
      const orderFlags = await scanShopOrders(row.id);
      if (followerSignal) signalsRaised += 1;
      if (reviewSignal) signalsRaised += 1;
      flagsRaised += orderFlags.length;
    } catch (err) {
      console.error(`AI Protection: failed to scan shop ${row.id}:`, err);
    }
  }
  return { checked: shops.rows.length, signalsRaised, flagsRaised };
}
