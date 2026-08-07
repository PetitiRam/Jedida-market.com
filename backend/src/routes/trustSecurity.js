import express from 'express';
import {
  openDispute, getDispute, myDisputes, addDisputeMessage, addDisputeEvidence,
  adminListDisputes, resolveDispute,
  listFraudFlags, reviewFraudFlag, createFraudFlag, runFraudScan,
  userSecurityTimeline
} from '../controllers/trustSecurityController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// ---- Disputes (buyer/seller) ----
router.post('/disputes', requireAuth, openDispute);
router.get('/disputes/mine', requireAuth, myDisputes);
router.get('/disputes/:id', requireAuth, getDispute);
router.post('/disputes/:id/messages', requireAuth, addDisputeMessage);
router.post('/disputes/:id/evidence', requireAuth, addDisputeEvidence);

// ---- Disputes (admin) ----
router.get('/admin/disputes', requireAuth, requirePermission('disputes'), adminListDisputes);
router.patch('/admin/disputes/:id/resolve', requireAuth, requirePermission('disputes'), resolveDispute);

// ---- Fraud flags (admin) ----
router.get('/admin/fraud-flags', requireAuth, requirePermission('fraud'), listFraudFlags);
router.post('/admin/fraud-flags', requireAuth, requirePermission('fraud'), createFraudFlag);
router.patch('/admin/fraud-flags/:id', requireAuth, requirePermission('fraud'), reviewFraudFlag);
router.post('/admin/fraud-flags/scan', requireAuth, requirePermission('fraud'), runFraudScan);

// ---- Unified security timeline (admin) ----
router.get('/admin/users/:userId/timeline', requireAuth, requirePermission('security'), userSecurityTimeline);

export default router;
