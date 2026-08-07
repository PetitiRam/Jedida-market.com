import express from 'express';
import {
  getFarmProfile, upsertMyFarmProfile,
  createSupplyContract, myContracts, updateContractStatus,
  getReliabilityScore, requestFarmPickup,
  AGRI_BUSINESS_ROLES,
} from '../controllers/agricultureController.js';
import { requireAuth, requireRole, denyAdminRole } from '../middleware/auth.js';

const router = express.Router();

// Farm profiles — storefront-facing agriculture data on top of the
// existing business_profiles (phase37) verification lifecycle. Bulk
// listing browse stays at the existing /api/products/agriculture
// (enriched in-place with quality_grade/harvest_date/reliability);
// wholesale tiers, certificates, and quote requests stay at /api/b2b/*;
// formal one-off deals stay at /api/enterprise (purchase_agreements).
router.get('/farms/:userId', requireAuth, getFarmProfile);
router.patch('/farms/me', requireAuth, requireRole(...AGRI_BUSINESS_ROLES), upsertMyFarmProfile);

// Supply contracts — repeat-purchase agreements. A market representative
// (phase44) may help draft one, but only the buyer/supplier themselves
// can create it — denyAdminRole is defense in depth on top of the DB-
// level chk_rep_cannot_touch_money constraint on market_representatives.
router.post('/contracts', requireAuth, denyAdminRole('business_rep'), createSupplyContract);
router.get('/contracts', requireAuth, myContracts);
router.patch('/contracts/:id', requireAuth, denyAdminRole('business_rep'), updateContractStatus);

// Trust/reliability.
router.get('/reliability/:userId', requireAuth, getReliabilityScore);

// Logistics — schedules a real delivery (existing deliveries/tracking
// system) as a farm pickup or collection-center drop-off.
router.post('/logistics/pickup', requireAuth, requestFarmPickup);

export default router;
