// Growth Benefits (Phase E of the Verified Shop System).
//
// Everything here is scoped to shops that already hold the ✓ badge — it's
// the reward layer on top of trustEngineService.js (the badge itself) and
// shopFeedController.js (the Shop Feed). Two things live in this file:
//
//   1. getGrowthDashboard() — an "advanced analytics" view that goes beyond
//      the generic Shop Builder analytics (shopBuilderController.js, open
//      to every seller) by adding what's specific to being Verified: how
//      the shop stacks up against other shops in its category, and how its
//      Shop Feed is performing.
//   2. generateSalesGrowthPlan() — the "AI Sales Growth Manager": like
//      aiBusinessManager.js's rule engine, this is deterministic
//      threshold/rule logic over numbers already on hand, not a call to an
//      external LLM. It's kept separate from aiBusinessManager.js rather
//      than extending it because the inputs and framing are different —
//      category benchmarking and trust-score levers instead of Shop
//      Builder blocks — and aiBusinessManager.js is intentionally
//      available to every seller, not just Verified ones.
import { query } from '../config/db.js';

// How a shop's trust score and completed-order volume compare to other
// Verified shops selling in the same primary_category — the concrete
// "priority ranking" story a seller can see, not just be told about.
async function getCategoryBenchmark(shop) {
  const result = await query(
    `SELECT COUNT(*) AS verified_peer_count,
            COALESCE(AVG(stm.trust_score), 0) AS avg_trust_score,
            COALESCE(AVG(stm.completed_orders_count), 0) AS avg_completed_orders,
            COALESCE(
              (SELECT COUNT(*) FROM shop_trust_metrics stm2
               JOIN shops s2 ON s2.id = stm2.shop_id
               WHERE s2.primary_category = $1 AND s2.is_verified = TRUE
                 AND stm2.trust_score <= (SELECT trust_score FROM shop_trust_metrics WHERE shop_id = $2)),
              0
            ) AS shops_at_or_below
     FROM shop_trust_metrics stm
     JOIN shops s ON s.id = stm.shop_id
     WHERE s.primary_category = $1 AND s.is_verified = TRUE AND s.id != $2`,
    [shop.primary_category, shop.id]
  );
  const row = result.rows[0] || {};
  const peerCount = Number(row.verified_peer_count || 0);
  const percentile = peerCount > 0 ? Math.round((Number(row.shops_at_or_below) / (peerCount + 1)) * 100) : 100;
  return {
    category: shop.primary_category,
    verifiedPeerCount: peerCount,
    avgTrustScore: Math.round(Number(row.avg_trust_score) * 10) / 10,
    avgCompletedOrders: Math.round(Number(row.avg_completed_orders)),
    trustScorePercentile: percentile // e.g. 80 = outranks 80% of Verified peers in this category
  };
}

async function getFeedEngagementSummary(shopId) {
  const result = await query(
    `SELECT COUNT(*) AS post_count,
            COALESCE(SUM(like_count), 0) AS total_likes,
            COALESCE(SUM(comment_count), 0) AS total_comments,
            COALESCE(SUM(share_count), 0) AS total_shares,
            COALESCE(SUM(save_count), 0) AS total_saves,
            MAX(created_at) AS last_posted_at
     FROM shop_feed_posts WHERE shop_id = $1 AND status = 'published'`,
    [shopId]
  );
  const row = result.rows[0];
  return {
    postCount: Number(row.post_count),
    totalLikes: Number(row.total_likes),
    totalComments: Number(row.total_comments),
    totalShares: Number(row.total_shares),
    totalSaves: Number(row.total_saves),
    lastPostedAt: row.last_posted_at,
    daysSinceLastPost: row.last_posted_at
      ? Math.floor((Date.now() - new Date(row.last_posted_at).getTime()) / (24 * 60 * 60 * 1000))
      : null
  };
}

async function getRecentGrowthActions(shopId, limit = 10) {
  const result = await query(
    `SELECT id, action_type, reference_id, details, created_at
     FROM shop_growth_actions WHERE shop_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [shopId, limit]
  );
  return result.rows;
}

// Products getting views but not converting — same "slow mover" heuristic
// aiBusinessManager.js uses, kept local so this module doesn't reach across
// into a generic-seller service for a Verified-only feature.
async function getSlowMovers(shopId) {
  const result = await query(
    `SELECT id, title, views_count, orders_count
     FROM products WHERE shop_id = $1 AND status = 'active' AND views_count >= 5 AND orders_count = 0
     ORDER BY views_count DESC LIMIT 3`,
    [shopId]
  );
  return result.rows;
}

export async function getGrowthDashboard(shop, metrics) {
  const [benchmark, feed, recentActions] = await Promise.all([
    getCategoryBenchmark(shop),
    getFeedEngagementSummary(shop.id),
    getRecentGrowthActions(shop.id)
  ]);

  return {
    searchRanking: {
      boosted: true,
      explanation: 'As a Verified Shop, your listings get a ranking boost ahead of unverified shops in every ' +
        'marketplace browse and search sort (except explicit price sorts), and your shop appears above ' +
        'unverified shops in the Shops directory.'
    },
    categoryBenchmark: benchmark,
    feedEngagement: feed,
    recentActions
  };
}

export async function generateSalesGrowthPlan(shop, metrics) {
  const [benchmark, feed, slowMovers] = await Promise.all([
    getCategoryBenchmark(shop),
    getFeedEngagementSummary(shop.id),
    getSlowMovers(shop.id)
  ]);

  const recommendations = [];

  recommendations.push({
    type: 'visibility',
    title: 'Your Verified badge is already boosting your reach',
    body: 'Verified shops rank ahead of unverified shops across the marketplace browse and search results, ' +
      'so keeping your trust score and delivery performance up directly grows your visibility — no extra work needed here.'
  });

  if (benchmark.verifiedPeerCount > 0 && benchmark.trustScorePercentile < 50) {
    const weakest = ['reliability_score', 'delivery_score', 'quality_score', 'satisfaction_score', 'response_score']
      .map((k) => ({ key: k, value: Number(metrics[k] || 0) }))
      .sort((a, b) => a.value - b.value)[0];
    const LABELS = {
      reliability_score: 'seller reliability', delivery_score: 'delivery performance',
      quality_score: 'product quality', satisfaction_score: 'customer satisfaction', response_score: 'response speed'
    };
    recommendations.push({
      type: 'benchmark',
      title: `You're behind the average Verified ${shop.primary_category} shop`,
      body: `Your trust score outranks ${benchmark.trustScorePercentile}% of Verified shops in ${shop.primary_category} ` +
        `(category average: ${benchmark.avgTrustScore}). ${LABELS[weakest.key]} is your weakest sub-score — improving it ` +
        'has the biggest effect on both your ranking and keeping the badge.'
    });
  }

  if (feed.postCount === 0) {
    recommendations.push({
      type: 'feed',
      title: 'Post to your Shop Feed',
      body: 'Verified shops with an active Shop Feed get more repeat visits from followers. You have not posted yet — ' +
        'a new-arrival or restock post is a quick way to start.'
    });
  } else if (feed.daysSinceLastPost !== null && feed.daysSinceLastPost >= 14) {
    recommendations.push({
      type: 'feed',
      title: 'Your Shop Feed has gone quiet',
      body: `It's been ${feed.daysSinceLastPost} days since your last post. Regular posts keep your shop visible to followers ` +
        'in their personalized feed — even a short update helps.'
    });
  }

  if (slowMovers.length > 0) {
    recommendations.push({
      type: 'promotion',
      title: `Promote "${slowMovers[0].title}"`,
      body: `${slowMovers[0].title} has ${slowMovers[0].views_count} views and no sales yet. Launch a short discount ` +
        'campaign or a Shop Feed promo post to convert some of that interest.',
      suggestedCampaign: {
        productId: slowMovers[0].id,
        productTitle: slowMovers[0].title,
        suggestedCoupon: { discountType: 'percent', discountValue: 10, expiresInDays: 14 },
        suggestedPost: { postType: 'promotion', discountPercent: 10, caption: `Limited-time: 10% off ${slowMovers[0].title}!` }
      }
    });
  }

  if (recommendations.length === 1) {
    recommendations.push({
      type: 'info',
      title: 'Your shop is performing well',
      body: 'No specific growth opportunities stand out right now — keep up the delivery performance and Shop Feed activity that earned your badge.'
    });
  }

  return { categoryBenchmark: benchmark, feedEngagement: feed, recommendations };
}

export async function logGrowthAction(shopId, actionType, referenceId, details = {}) {
  const result = await query(
    `INSERT INTO shop_growth_actions (shop_id, action_type, reference_id, details) VALUES ($1,$2,$3,$4) RETURNING *`,
    [shopId, actionType, referenceId || null, JSON.stringify(details)]
  );
  return result.rows[0];
}
