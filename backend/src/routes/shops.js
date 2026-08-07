import express from 'express';
import {
  createShop, getMyShop, updateMyShop, deleteMyShop, getPublicShopBySlug, listAllShops
} from '../controllers/shopsController.js';
import { requireAuth, requireMfaEnabled } from '../middleware/auth.js';
import { requireFaceVerification } from '../middleware/faceVerification.js';
import { updateShopSettings, setFeaturedProducts, getPublicShopBySlugV2, listFeaturedShops } from '../controllers/shopsController.js';
import { getMyVerificationStatus } from '../controllers/verifiedShopController.js';

const router = express.Router();

router.post('/', requireAuth, createShop);
router.get('/me', requireAuth, getMyShop);
router.patch('/me', requireAuth, updateMyShop);
router.delete('/me', requireAuth, requireMfaEnabled, requireFaceVerification('business_deletion'), deleteMyShop);
router.get('/public/:slug', getPublicShopBySlug); // used by SPA + social-preview HTML route
router.get('/featured', listFeaturedShops); // homepage "Featured Shops" section
router.get('/', listAllShops); // Main Marketplace "Shops" tab
router.patch('/me/settings', requireAuth, updateShopSettings);
router.patch('/me/featured', requireAuth, setFeaturedProducts);
router.get('/public-v2/:slug', getPublicShopBySlugV2); // richer payload; old /public/:slug stays untouched
// Verified Shop trust engine (schema_phase59) — seller's own live status,
// requirements met/missing, and current thresholds.
router.get('/me/verification', requireAuth, getMyVerificationStatus);

export default router;
