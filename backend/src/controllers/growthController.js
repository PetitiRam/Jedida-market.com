import { query } from '../config/db.js';
import { getShopTrustMetrics } from '../services/trustEngineService.js';
import { getGrowthDashboard, generateSalesGrowthPlan, logGrowthAction } from '../services/growthEngineService.js';

// Growth Hub is gated to Verified Shops the same way the Shop Feed is
// (shopFeedController.js's getOwnVerifiedShop) — it's listed as a Verified
// Shop benefit in the brief, not a general seller tool.
async function getOwnVerifiedShop(userId) {
  const result = await query('SELECT * FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0] || null;
}

function verifiedGateResponse(res, shop) {
  if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });
  if (!shop.is_verified) {
    return res.status(403).json({
      error: "The Growth Hub (advanced analytics, AI Sales Growth Manager, and promotional tools) is a benefit " +
        "of becoming a Verified Shop. Check your Verification tab to see what's still needed."
    });
  }
  return null;
}

// ===== Seller-facing =====

export async function getMyGrowthDashboard(req, res) {
  try {
    const shop = await getOwnVerifiedShop(req.user.id);
    const gate = verifiedGateResponse(res, shop);
    if (gate) return gate;

    const metrics = await getShopTrustMetrics(shop.id);
    const dashboard = await getGrowthDashboard(shop, metrics || {});
    return res.json({ shopIsVerified: true, metrics, ...dashboard });
  } catch (err) {
    console.error('Get growth dashboard error:', err);
    return res.status(500).json({ error: 'Could not load your Growth Hub dashboard.' });
  }
}

export async function getMySalesGrowthPlan(req, res) {
  try {
    const shop = await getOwnVerifiedShop(req.user.id);
    const gate = verifiedGateResponse(res, shop);
    if (gate) return gate;

    const metrics = await getShopTrustMetrics(shop.id);
    const plan = await generateSalesGrowthPlan(shop, metrics || {});
    return res.json({ shopIsVerified: true, ...plan });
  } catch (err) {
    console.error('Get sales growth plan error:', err);
    return res.status(500).json({ error: 'Could not generate your growth plan.' });
  }
}

export async function listMyGrowthActions(req, res) {
  try {
    const shop = await getOwnVerifiedShop(req.user.id);
    const gate = verifiedGateResponse(res, shop);
    if (gate) return gate;

    const result = await query(
      'SELECT * FROM shop_growth_actions WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 30',
      [shop.id]
    );
    return res.json({ actions: result.rows });
  } catch (err) {
    console.error('List growth actions error:', err);
    return res.status(500).json({ error: 'Could not load your growth activity.' });
  }
}

// One-click promotional tool #1: launch a discount coupon for the shop.
// Mirrors couponsController.createCoupon exactly (same table, same
// validation) — the Growth Hub is a curated, Verified-only entry point
// into a mechanism that already exists, not a new commerce system.
export async function launchDiscountCampaign(req, res) {
  try {
    const shop = await getOwnVerifiedShop(req.user.id);
    const gate = verifiedGateResponse(res, shop);
    if (gate) return gate;

    const { code, discountType = 'percent', discountValue, minOrderAmount, maxUses, expiresAt } = req.body;
    if (!code || !discountValue) return res.status(400).json({ error: 'code and discountValue are required.' });
    if (!['percent', 'fixed'].includes(discountType)) return res.status(400).json({ error: 'discountType must be percent or fixed.' });

    const couponResult = await query(
      `INSERT INTO coupons (shop_id, code, discount_type, discount_value, min_order_amount, max_uses, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [shop.id, String(code).toUpperCase(), discountType, discountValue, minOrderAmount || 0, maxUses || null, expiresAt || null, req.user.id]
    );
    const coupon = couponResult.rows[0];
    await logGrowthAction(shop.id, 'discount_campaign', coupon.id, { code: coupon.code, discountType, discountValue });

    return res.status(201).json({ message: 'Discount campaign launched.', coupon });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A coupon with this code already exists for your shop.' });
    console.error('Launch discount campaign error:', err);
    return res.status(500).json({ error: 'Could not launch discount campaign.' });
  }
}

// One-click promotional tool #2: publish a promo post to the Shop Feed.
// Mirrors shopFeedController.createPost's insert — same table, same
// verified gate — just packaged as a "growth action" the seller launches
// from the Growth Hub instead of the Shop Feed composer.
export async function launchPromoPost(req, res) {
  try {
    const shop = await getOwnVerifiedShop(req.user.id);
    const gate = verifiedGateResponse(res, shop);
    if (gate) return gate;

    const { caption = '', productId, discountPercent, offerEndsAt, media = [], postType = 'promotion' } = req.body;
    if (!caption.trim() && (!Array.isArray(media) || media.length === 0)) {
      return res.status(400).json({ error: 'A promo post needs a caption or at least one photo/video.' });
    }
    if (productId) {
      const productCheck = await query('SELECT id FROM products WHERE id = $1 AND shop_id = $2', [productId, shop.id]);
      if (productCheck.rows.length === 0) return res.status(400).json({ error: 'That product does not belong to your shop.' });
    }

    const postResult = await query(
      `INSERT INTO shop_feed_posts (shop_id, author_id, post_type, caption, media, product_id, discount_percent, offer_ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [shop.id, req.user.id, postType, caption.trim(), JSON.stringify(media || []), productId || null, discountPercent || null, offerEndsAt || null]
    );
    const post = postResult.rows[0];
    await logGrowthAction(shop.id, 'promo_post', post.id, { postType, productId: productId || null });

    return res.status(201).json({ message: 'Promo post published to your Shop Feed.', post });
  } catch (err) {
    console.error('Launch promo post error:', err);
    return res.status(500).json({ error: 'Could not publish promo post.' });
  }
}

// ===== Admin-facing =====

// Aggregate Growth Hub usage across all Verified shops, for the admin
// Verified Shops panel's Growth Benefits sub-tab.
export async function getAdminGrowthOverview(req, res) {
  try {
    const [summary, recent, topShops] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*) FROM shops WHERE is_verified = TRUE) AS verified_shop_count,
           (SELECT COUNT(*) FROM shop_growth_actions WHERE action_type = 'discount_campaign' AND created_at >= now() - interval '30 days') AS campaigns_last_30d,
           (SELECT COUNT(*) FROM shop_growth_actions WHERE action_type = 'promo_post' AND created_at >= now() - interval '30 days') AS promo_posts_last_30d`
      ),
      query(
        `SELECT sga.*, s.name AS shop_name, s.slug AS shop_slug
         FROM shop_growth_actions sga JOIN shops s ON s.id = sga.shop_id
         ORDER BY sga.created_at DESC LIMIT 30`
      ),
      query(
        `SELECT s.id, s.name, s.slug, s.primary_category, stm.trust_score, stm.completed_orders_count, stm.real_follower_count
         FROM shops s JOIN shop_trust_metrics stm ON stm.shop_id = s.id
         WHERE s.is_verified = TRUE
         ORDER BY stm.trust_score DESC LIMIT 10`
      )
    ]);
    return res.json({ summary: summary.rows[0], recentActions: recent.rows, topShops: topShops.rows });
  } catch (err) {
    console.error('Get admin growth overview error:', err);
    return res.status(500).json({ error: 'Could not load growth benefits overview.' });
  }
}
