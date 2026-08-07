import express from 'express';
import { body } from 'express-validator';
import { myWallet, myWalletTransactions, platformWallets, requestWithdrawal, myWithdrawals } from '../controllers/walletsController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { withdrawalsGate } from '../middleware/platformLockdown.js';
import { handleValidationErrors } from '../middleware/validate.js';
import { requireFaceVerification } from '../middleware/faceVerification.js';

const router = express.Router();
router.get('/mine', requireAuth, myWallet);
router.get('/mine/transactions', requireAuth, myWalletTransactions);
router.get('/platform', requireAuth, requireAdmin, platformWallets);
router.post(
  '/withdraw',
  requireAuth,
  withdrawalsGate,
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number.'),
    body('method').isIn(['stripe', 'flutterwave', 'dpo', 'coinbase', 'wallet']).withMessage('Unsupported payout method.'),
    body('destination').optional({ nullable: true }).isString().trim().isLength({ max: 255 }).withMessage('Destination must be 255 characters or fewer.'),
  ],
  handleValidationErrors,
  requireFaceVerification('withdrawal'),
  requestWithdrawal
);
router.get('/withdrawals/mine', requireAuth, myWithdrawals);
export default router;
