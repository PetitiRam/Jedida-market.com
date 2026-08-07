import express from 'express';
import {
  getOverview, listEvents, resolveEvent,
  listBlockedIps, blockIp, unblockIp, searchAuditLog,
  auditIntegrityStatus,
  getFaceVerificationSettings, updateFaceVerificationSettings,
} from '../controllers/securityOpsController.js';
import { requireAuth, requireAdmin, requirePermission, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireAdmin, requirePermission('security'));

router.get('/overview', getOverview);

router.get('/events', listEvents);
router.patch('/events/:id/resolve', resolveEvent);

router.get('/blocked-ips', listBlockedIps);
router.post('/blocked-ips', blockIp);
router.delete('/blocked-ips/:id', unblockIp);

router.get('/audit-log', searchAuditLog);
router.get('/audit-log/integrity', auditIntegrityStatus);

// Changing the face-verification provider/threshold/on-off switch is a
// "Modify Security Policies" action — reserved for super admins only,
// same as auth policy changes elsewhere in the Security Center.
router.get('/face-verification', getFaceVerificationSettings);
router.patch('/face-verification', requireSuperAdmin, updateFaceVerificationSettings);

export default router;
