import express from 'express';
import { body } from 'express-validator';
import { getMyPayoutMethod, updateMyPayoutMethod } from '../controllers/payoutMethodsController.js';
import { requireAuth, requireMfaEnabled } from '../middleware/auth.js';
import { requireFaceVerification } from '../middleware/faceVerification.js';
import { handleValidationErrors } from '../middleware/validate.js';

const router = express.Router();

router.get('/', requireAuth, getMyPayoutMethod);

router.put(
  '/',
  requireAuth,
  requireMfaEnabled,
  [
    body('methodType').isIn(['bank_account', 'mobile_money']).withMessage('methodType must be "bank_account" or "mobile_money".'),
    body('provider').isString().trim().isLength({ min: 1, max: 100 }),
    body('accountIdentifier').isString().trim().isLength({ min: 4, max: 64 }),
    body('accountName').isString().trim().isLength({ min: 1, max: 150 }),
  ],
  handleValidationErrors,
  requireFaceVerification('payout_method_change'),
  updateMyPayoutMethod
);

export default router;
