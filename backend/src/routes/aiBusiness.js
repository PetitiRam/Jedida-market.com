// AI Business Assistant — the seller-facing hub that ties together every
// AI "digital employee" JEDIDA already has (or now has): Amina (store
// creation), Nsubuga Joseph (product manager), TAUSI (analytics, marketing,
// recommendations — previously admin-only), and PETITI's security engine
// (previously admin-only). Every route here is scoped to the signed-in
// seller's OWN shop — nobody can pull another seller's data through this
// hub even though the underlying engines are marketplace-wide.

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { designStore } from '../services/storeDesignerBot.js';
import { analyzeProduct } from '../services/nsubugaJosephBot.js';
import { addMemory, listMemory, deleteMemory } from '../services/shopAiMemory.js';
import * as tausi from '../../ai/tausi/tausiService.js';
import * as marketing from '../../ai/tausi/tausiMarketingEngine.js';
import { computeRiskScore, listFraudReportsForShop } from '../../ai/petiti/petitiSecurityEngine.js';

const router = express.Router();
router.use(requireAuth);

async function myShop(req, res) {
  const result = await query('SELECT * FROM shops WHERE owner_id = $1 LIMIT 1', [req.user.id]);
  if (!result.rows[0]) {
    res.status(404).json({ error: 'You need a shop before using the AI Business Assistant. Create one first.' });
    return null;
  }
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// 1. Amina — AI Store Creation Assistant
// ---------------------------------------------------------------------------
router.post('/store-design', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const { businessDescription, overwriteDescription } = req.body;
    if (!businessDescription?.trim()) return res.status(400).json({ error: 'Describe your business in a sentence or two first.' });
    const design = await designStore({ shopId: shop.id, shopName: shop.name, businessDescription, overwriteDescription: !!overwriteDescription });
    res.json({ design });
  } catch (err) {
    console.error('AI store-design error:', err);
    res.status(500).json({ error: 'Could not design your storefront right now.' });
  }
});

// ---------------------------------------------------------------------------
// 2. Nsubuga Joseph — AI Product Manager
// ---------------------------------------------------------------------------
router.post('/product-review', async (req, res) => {
  try {
    const { title, description, category, price, currency, images, specs } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'A product title is required to review.' });
    const analysis = await analyzeProduct({ title, description, category, price, currency, images, specs });
    res.json({ analysis });
  } catch (err) {
    console.error('AI product-review error:', err);
    res.status(500).json({ error: 'Could not review this product right now.' });
  }
});

// ---------------------------------------------------------------------------
// 5. TAUSI — AI Business Analytics
// ---------------------------------------------------------------------------
router.get('/analytics', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const analytics = await tausi.shopAnalytics(shop.id);
    res.json({ analytics });
  } catch (err) {
    console.error('AI analytics error:', err);
    res.status(500).json({ error: 'Could not load your analytics right now.' });
  }
});

router.get('/performance', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const performance = await tausi.sellerPerformance(shop.id);
    res.json({ performance });
  } catch (err) {
    console.error('AI performance error:', err);
    res.status(500).json({ error: 'Could not load your performance right now.' });
  }
});

// ---------------------------------------------------------------------------
// 6. TAUSI — AI Marketing Assistant
// ---------------------------------------------------------------------------
router.post('/marketing/generate', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const { productId, kind } = req.body;
    if (productId) {
      const owns = await query('SELECT id FROM products WHERE id = $1 AND shop_id = $2', [productId, shop.id]);
      if (!owns.rows[0]) return res.status(403).json({ error: 'That product is not in your shop.' });
    }
    const copy = await marketing.generateMarketingCopy({ shopId: shop.id, shopName: shop.name, productId, kind });
    res.json({ copy });
  } catch (err) {
    console.error('AI marketing-generate error:', err);
    res.status(500).json({ error: 'Could not generate marketing copy right now.' });
  }
});

router.post('/marketing/campaigns', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const { productId, title, budget } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Give your campaign a title.' });
    if (productId) {
      const owns = await query('SELECT id FROM products WHERE id = $1 AND shop_id = $2', [productId, shop.id]);
      if (!owns.rows[0]) return res.status(403).json({ error: 'That product is not in your shop.' });
    }
    const campaign = await marketing.submitAdCampaignDraft({ shopId: shop.id, productId, title, budget });
    res.status(201).json({ campaign });
  } catch (err) {
    console.error('AI campaign-submit error:', err);
    res.status(500).json({ error: 'Could not submit your campaign right now.' });
  }
});

router.get('/marketing/campaigns', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const result = await query('SELECT * FROM ad_campaigns WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 50', [shop.id]);
    res.json({ campaigns: result.rows });
  } catch (err) {
    console.error('AI list-campaigns error:', err);
    res.status(500).json({ error: 'Could not load your campaigns right now.' });
  }
});

// ---------------------------------------------------------------------------
// 8. PETITI — AI Security Monitor (self-service view)
// ---------------------------------------------------------------------------
router.get('/security', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const [risk, reports] = await Promise.all([
      computeRiskScore(req.user.id),
      listFraudReportsForShop(shop.id, req.user.id),
    ]);
    res.json({ ...risk, reports });
  } catch (err) {
    console.error('AI security-view error:', err);
    res.status(500).json({ error: 'Could not load your security overview right now.' });
  }
});

// ---------------------------------------------------------------------------
// 10. AI Business Memory
// ---------------------------------------------------------------------------
router.get('/memory', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    res.json({ memory: await listMemory(shop.id) });
  } catch (err) {
    console.error('AI memory-list error:', err);
    res.status(500).json({ error: 'Could not load your AI notes right now.' });
  }
});

router.post('/memory', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    const { content, category } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Write something for the AI to remember.' });
    const entry = await addMemory(shop.id, { content, category: category || 'note', createdBy: 'owner' });
    res.status(201).json({ entry });
  } catch (err) {
    console.error('AI memory-add error:', err);
    res.status(500).json({ error: 'Could not save that note right now.' });
  }
});

router.delete('/memory/:id', async (req, res) => {
  const shop = await myShop(req, res);
  if (!shop) return;
  try {
    await deleteMemory(shop.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('AI memory-delete error:', err);
    res.status(500).json({ error: 'Could not delete that note right now.' });
  }
});

export default router;
