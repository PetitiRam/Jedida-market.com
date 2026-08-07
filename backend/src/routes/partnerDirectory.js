import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  listDirectory, getDirectoryEntry, submitInterest,
  getDropshipStatus, enrollDropshipping, revokeDropshipEnrollment
} from '../controllers/partnerDirectoryController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const interestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many requests. Please try again later.' }
});

// Public browsing — no account required, mirrors any other storefront page.
router.get('/', listDirectory);
router.get('/:id', getDirectoryEntry);
router.post('/:id/interest', interestLimiter, submitInterest);

// Dropshipping enrollment requires being signed in (any role) — the
// instructions acknowledgment is tied to a real account, not an anonymous click.
router.get('/:id/dropship/status', requireAuth, getDropshipStatus);
router.post('/:id/dropship/enroll', requireAuth, enrollDropshipping);
router.delete('/:id/dropship/enroll', requireAuth, revokeDropshipEnrollment);

export default router;
