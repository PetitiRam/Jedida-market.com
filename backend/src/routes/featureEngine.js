import express from 'express';
import * as ctrl from '../controllers/featureEngineController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Seller-facing — what can my shop actually use, and toggling activation
// for features it's eligible for.
router.get('/mine', requireAuth, ctrl.getMyCapabilities);
router.post('/mine/:key/toggle', requireAuth, ctrl.toggleMyFeature);

// Admin — global feature lifecycle. Reuses the 'upgrades' permission area
// (seller/role/eligibility surface), same as the logistics/dropship admin.
router.use('/admin', requireAuth, requireAdmin, requirePermission('upgrades'));
router.get('/admin', ctrl.adminListFeatures);
router.post('/admin', ctrl.adminCreateFeature);
router.patch('/admin/:key/status', ctrl.adminUpdateFeatureStatus);
router.patch('/admin/:key/eligibility', ctrl.adminUpdateFeatureEligibility);

export default router;
