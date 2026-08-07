import express from 'express';
import * as ctrl from '../controllers/settingsCenterController.js';
import { requireAuth, requireAdmin, requireSuperAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Public — buyers need to know which payment methods are actually enabled
// before requireAuth/requireAdmin locks down the rest of this router.
router.get('/public/payment-methods', ctrl.getPublicPaymentSettings);

router.use(requireAuth, requireAdmin);

// Which settings section maps to which permission area. Sections not listed
// here (security, maintenance, user, sellerUpgrade, commission, delivery,
// shop, product) are platform-wide/sensitive enough to stay super-admin-only
// by default, rather than guessing a broader mapping that isn't ours to decide.
const SECTION_AREA = { payment: 'withdrawals', ads: 'ads', ai: 'ai' };
function requireSectionAccess(req, res, next) {
  const area = SECTION_AREA[req.params.section];
  if (area) return requirePermission(area)(req, res, next);
  return requireSuperAdmin(req, res, next);
}

router.get('/all', ctrl.getAllSettings);
router.patch('/identity', requireSuperAdmin, ctrl.updateIdentity);
router.patch('/branding', requireSuperAdmin, ctrl.updateBranding);

router.get('/section/:section', ctrl.getSection);
router.patch('/section/:section', requireSectionAccess, ctrl.updateSection);

router.get('/audit-log', ctrl.getAuditLog);

router.get('/legal', ctrl.listLegalDocuments);
router.get('/legal/:docType', ctrl.getLegalDocument);
router.put('/legal/:docType', requireSuperAdmin, ctrl.updateLegalDocument);

router.get('/system-info', ctrl.getSystemInfo);

router.post('/backup', requireSuperAdmin, ctrl.createBackup);
router.get('/backups', ctrl.listBackups);
router.post('/restore', requireSuperAdmin, ctrl.restoreBackup);

export default router;
