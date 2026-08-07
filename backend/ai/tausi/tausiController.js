import * as tausi from './tausiService.js';
import * as category from './tausiCategoryEngine.js';
import * as rec from './tausiRecommendationEngine.js';
import * as ads from './tausiAdsEngine.js';
import * as marketplace from './tausiMarketplaceEngine.js';
import { query } from '../../src/config/db.js';

export async function getDashboard(req, res) {
  const [campaigns, performance] = await Promise.all([
    ads.listCampaigns({ status: 'active' }),
    tausi.allSellerPerformance()
  ]);
  res.json({ activeCampaigns: campaigns, sellerPerformance: performance.slice(0, 10) });
}

export async function postCategorize(req, res) {
  const result = category.categorize(req.body);
  res.json(result);
}

export async function postRecomputeScores(req, res) {
  const updated = await rec.computeScoresForAllProducts();
  res.json({ message: `Recomputed scores for ${updated} products.`, updated });
}

export async function getTopRanked(req, res) {
  const { category: cat, limit } = req.query;
  const products = await rec.topRankedByCategory(cat, limit ? Number(limit) : 20);
  res.json({ products });
}

export async function getRecommendationsForMe(req, res) {
  const products = await rec.recommendForUser(req.user.id);
  res.json({ products });
}

export async function getProductIntelligence(req, res) {
  const result = await query(`
    SELECT p.id, p.title, p.category, ps.overall_score, ps.quality_score, ps.demand_score, ps.trust_score
    FROM products p JOIN product_scores ps ON ps.product_id = p.id
    ORDER BY ps.overall_score DESC LIMIT 100
  `);
  res.json({ products: result.rows });
}

export async function getSellerPerformance(req, res) {
  const result = await tausi.allSellerPerformance();
  res.json({ sellers: result });
}

// ===== Ads =====
export async function postCampaign(req, res) {
  const campaign = await ads.createCampaign(req.body);
  res.status(201).json({ campaign });
}
export async function postReviewCampaign(req, res) {
  const campaign = await ads.reviewCampaign(req.params.id, req.body.decision);
  res.json({ campaign });
}
export async function getCampaigns(req, res) {
  const campaigns = await ads.listCampaigns({ status: req.query.status });
  res.json({ campaigns });
}
export async function postRecomputeAdScores(req, res) {
  const updated = await ads.computePerformanceScores();
  res.json({ message: `Recomputed ${updated} campaign scores.` });
}

// ===== Marketplace automation (homepage curation) =====
export async function getMarketplaceSettings(req, res) {
  const result = await query(`SELECT * FROM tausi_marketplace_settings ORDER BY behavior ASC`);
  res.json({ settings: result.rows });
}

export async function patchMarketplaceSettings(req, res) {
  const { isEnabled } = req.body;
  const result = await query(
    `UPDATE tausi_marketplace_settings SET is_enabled = $1 WHERE behavior = $2 RETURNING *`,
    [Boolean(isEnabled), req.params.behavior]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Unknown behavior.' });
  res.json({ setting: result.rows[0] });
}

export async function getMarketplaceActions(req, res) {
  const params = [];
  let where = '';
  if (req.query.status) { params.push(req.query.status); where = `WHERE status = $${params.length}`; }
  params.push(Number(req.query.limit) || 50);
  const result = await query(
    `SELECT * FROM tausi_marketplace_actions ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json({ actions: result.rows });
}

export async function postRunMarketplaceBehavior(req, res) {
  try {
    const behavior = req.params.behavior;
    const result = behavior === 'all' ? await marketplace.runAllEnabled() : await marketplace.runBehavior(behavior);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function patchMarketplaceAction(req, res) {
  const { status } = req.body; // 'accepted' | 'dismissed'
  if (!['accepted', 'dismissed'].includes(status)) return res.status(400).json({ error: 'status must be accepted or dismissed.' });
  const result = await query(`UPDATE tausi_marketplace_actions SET status = $1 WHERE id = $2 RETURNING *`, [status, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Action not found.' });
  res.json({ action: result.rows[0] });
}
