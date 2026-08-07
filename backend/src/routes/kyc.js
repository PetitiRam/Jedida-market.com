import express from 'express';
import { submitKyc, myKycStatus, getDraft, saveDraft, submitFull, checkDuplicate } from '../controllers/kycController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Original one-shot flow (WalletKycPanel).
router.post('/submit', requireAuth, submitKyc);
router.get('/status', requireAuth, myKycStatus);

// New multi-step wizard.
router.get('/check-duplicate', requireAuth, checkDuplicate);
router.get('/draft', requireAuth, getDraft);
router.patch('/draft', requireAuth, saveDraft);
router.post('/submit-full', requireAuth, submitFull);

export default router;
