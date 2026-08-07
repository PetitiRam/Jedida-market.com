import express from 'express';
import {
  getMyGrowthDashboard, getMySalesGrowthPlan, listMyGrowthActions,
  launchDiscountCampaign, launchPromoPost
} from '../controllers/growthController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Verified-shop check happens in the controller (same pattern as shopFeed.js)
// so a non-verified seller gets a clear, actionable 403 instead of a 404.
router.get('/dashboard', requireAuth, getMyGrowthDashboard);
router.get('/plan', requireAuth, getMySalesGrowthPlan);
router.get('/actions', requireAuth, listMyGrowthActions);
router.post('/discount-campaign', requireAuth, launchDiscountCampaign);
router.post('/promo-post', requireAuth, launchPromoPost);

export default router;
