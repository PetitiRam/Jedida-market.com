import express from 'express';
import {
  upsertTradeCapabilities, getMyTradeCapabilities, getSupplierTradeProfile,
  requestFactoryVerification, myFactoryVerifications,
  adminListFactoryVerifications, adminScheduleFactoryVerification, adminSubmitFactoryVerificationReport,
  adminAwardAfricaReadyBadge, adminRevokeAfricaReadyBadge,
  requestInspection, myInspectionRequests,
  adminListInspections, adminScheduleInspection, adminSubmitInspectionReport,
  CHINA_HUB_SUPPLIER_ROLES
} from '../controllers/chinaTradeHubController.js';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// ---- Supplier/manufacturer self-service ----
router.put('/capabilities', requireAuth, requireRole(...CHINA_HUB_SUPPLIER_ROLES), upsertTradeCapabilities);
router.get('/capabilities/mine', requireAuth, requireRole(...CHINA_HUB_SUPPLIER_ROLES), getMyTradeCapabilities);
router.post('/factory-verification/request', requireAuth, requireRole(...CHINA_HUB_SUPPLIER_ROLES), requestFactoryVerification);
router.get('/factory-verification/mine', requireAuth, requireRole(...CHINA_HUB_SUPPLIER_ROLES), myFactoryVerifications);

// ---- Buyer-facing ----
router.get('/suppliers/:businessProfileId', requireAuth, getSupplierTradeProfile);
router.post('/inspections', requireAuth, requestInspection);
router.get('/inspections/mine', requireAuth, myInspectionRequests);

// ---- Admin/verifier/inspector (gated under the existing 'upgrades'
// permission area, same one business verification review already uses) ----
router.get('/admin/factory-verification', requireAuth, requirePermission('upgrades'), adminListFactoryVerifications);
router.patch('/admin/factory-verification/:id/schedule', requireAuth, requirePermission('upgrades'), adminScheduleFactoryVerification);
router.post('/admin/factory-verification/:id/report', requireAuth, requirePermission('upgrades'), adminSubmitFactoryVerificationReport);
router.post('/admin/africa-ready/award', requireAuth, requirePermission('upgrades'), adminAwardAfricaReadyBadge);
router.post('/admin/africa-ready/:businessProfileId/revoke', requireAuth, requirePermission('upgrades'), adminRevokeAfricaReadyBadge);

router.get('/admin/inspections', requireAuth, requirePermission('upgrades'), adminListInspections);
router.patch('/admin/inspections/:id/schedule', requireAuth, requirePermission('upgrades'), adminScheduleInspection);
router.post('/admin/inspections/:id/report', requireAuth, requirePermission('upgrades'), adminSubmitInspectionReport);

export default router;
