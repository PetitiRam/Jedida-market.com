import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  uploadPartnerDocument, submitApplication,
  listApplications, getApplicationDetail, reviewApplication,
  bulkReviewApplications, assignReviewer, addNote,
  suspendPartnership, reactivatePartnership, exportApplications, listEligibleReviewers,
  listProfileChangeRequests, reviewProfileChangeRequest
} from '../controllers/partnerController.js';
import { requireAuth, requireAdmin, requirePermission, requireSuperAdmin } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Applicants are companies, not signed-in marketplace users, so the
// application form and its document uploads are public — protected only
// by rate limiting against abuse.
const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please try again later.' }
});

const router = express.Router();

// Public: application intake
router.post('/documents', applyLimiter, upload.single('file'), uploadPartnerDocument);
router.post('/apply', applyLimiter, submitApplication);

// Admin: review queue — mounted separately below under /api/admin/partners
export const adminPartnerRouter = express.Router();
adminPartnerRouter.use(requireAuth, requireAdmin);
adminPartnerRouter.get('/export', requirePermission('partners'), exportApplications);
adminPartnerRouter.get('/reviewers', requirePermission('partners'), listEligibleReviewers);
adminPartnerRouter.get('/', requirePermission('partners'), listApplications);
adminPartnerRouter.get('/:id', requirePermission('partners'), getApplicationDetail);
adminPartnerRouter.patch('/bulk', requirePermission('partners'), bulkReviewApplications);
adminPartnerRouter.patch('/:id', requirePermission('partners'), reviewApplication);
adminPartnerRouter.patch('/:id/assign-reviewer', requirePermission('partners'), assignReviewer);
adminPartnerRouter.post('/:id/notes', requirePermission('partners'), addNote);
adminPartnerRouter.get('/change-requests/list', requirePermission('partners'), listProfileChangeRequests);
adminPartnerRouter.patch('/change-requests/:id', requirePermission('partners'), reviewProfileChangeRequest);
// Suspend/reactivate act on an already-approved partnership, not an
// in-flight application — Super Admin only, per spec.
adminPartnerRouter.patch('/:id/suspend', requireSuperAdmin, suspendPartnership);
adminPartnerRouter.patch('/:id/reactivate', requireSuperAdmin, reactivatePartnership);

export default router;
