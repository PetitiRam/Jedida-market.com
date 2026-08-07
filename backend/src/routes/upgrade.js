import express from 'express';
import {
  requestUpgrade, submitPayment, submitKyc, myUpgradeStatus,
  getUpgradePricing, submitOneTimeUpgrade, submitBusinessVerification,
  sendPaymentInstructions
} from '../controllers/upgradeController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Public — powers the country selector / mobile money provider list / amount
// on the redesigned Upgrade page, before the user has to authenticate.
router.get('/pricing', getUpgradePricing);

router.post('/request', requireAuth, requestUpgrade);
router.post('/payment', requireAuth, submitPayment);
router.post('/pay-fee', requireAuth, submitPayment);
router.post('/one-time', requireAuth, submitOneTimeUpgrade);
// Fired once by the Upgrade page on load — AI-assistant greeting with the
// platform's mobile money receiving details, mirrored into notifications.
router.post('/payment-instructions', requireAuth, sendPaymentInstructions);
router.post('/kyc', requireAuth, submitKyc);
router.post('/business-verification', requireAuth, submitBusinessVerification);
router.get('/status', requireAuth, myUpgradeStatus);

export default router;
