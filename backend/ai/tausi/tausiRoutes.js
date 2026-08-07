import express from 'express';
import * as ctrl from './tausiController.js';
import { requireAuth, requireAdmin, requirePermission } from '../../src/middleware/auth.js';

const router = express.Router();

// Buyer-facing
router.get('/recommendations/mine', requireAuth, ctrl.getRecommendationsForMe);
router.get('/ranked', ctrl.getTopRanked);
router.get('/campaigns/active', (req, res, next) => { req.query.status = 'active'; next(); }, ctrl.getCampaigns);

// Admin-gated management
router.use(requireAuth, requireAdmin, requirePermission('ai'));
router.get('/dashboard', ctrl.getDashboard);
router.post('/categorize', ctrl.postCategorize);
router.post('/scores/recompute', ctrl.postRecomputeScores);
router.get('/product-intelligence', ctrl.getProductIntelligence);
router.get('/seller-performance', ctrl.getSellerPerformance);

router.post('/campaigns', ctrl.postCampaign);
router.post('/campaigns/:id/review', ctrl.postReviewCampaign);
router.get('/campaigns', ctrl.getCampaigns);
router.post('/campaigns/recompute-scores', ctrl.postRecomputeAdScores);

// Marketplace automation — the 7 Tausi behaviors that keep the homepage
// curated (best-product selection, low-performer replacement, outdated
// banner detection, featured rotation, category image refresh, promo
// recommendations, seasonal campaign suggestions).
router.get('/marketplace/settings', ctrl.getMarketplaceSettings);
router.patch('/marketplace/settings/:behavior', ctrl.patchMarketplaceSettings);
router.get('/marketplace/actions', ctrl.getMarketplaceActions);
router.patch('/marketplace/actions/:id', ctrl.patchMarketplaceAction);
router.post('/marketplace/run/:behavior', ctrl.postRunMarketplaceBehavior);

export default router;
