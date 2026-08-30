import express from 'express';
import { body, query as queryValidator } from 'express-validator';
import {
  myWallet, myWalletTransactions, platformWallets, requestWithdrawal, myWithdrawals,
  previewWalletFee, createDeposit, confirmDeposit, myDeposits, listDepositMethods, createTransfer, myTransfers,
} from '../controllers/walletsController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { withdrawalsGate } from '../middleware/platformLockdown.js';
import { handleValidationErrors } from '../middleware/validate.js';
import { requireFaceVerification } from '../middleware/faceVerification.js';

const router = express.Router();
router.get('/mine', requireAuth, myWallet);
router.get('/mine/transactions', requireAuth, myWalletTransactions);
router.get('/platform', requireAuth, requireAdmin, platformWallets);

// Deposit and Transfer come from the adopted wallet implementation
// (INTEGRATION_DECISION_REPORT.md section 3) below -- withdraw and the
// pre-existing balance/history endpoints above are extended, not
// replaced, by it.
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

router.get(
  '/fees/preview',
  requireAuth,
  [queryValidator('amount').isFloat({ gt: 0 }), queryValidator('type').optional().isIn(['withdrawal', 'deposit', 'transfer'])],
  handleValidationErrors,
  previewWalletFee
);

router.post(
  '/deposits',
  requireAuth,
  [
    body('methodCode').isString().notEmpty(),
    body('amount').isFloat({ gt: 0 }),
    body('idempotencyKey').isString().trim().notEmpty().withMessage('Missing idempotency key.'),
  ],
  handleValidationErrors,
  createDeposit
);
router.post('/deposits/:id/confirm', requireAuth, confirmDeposit);
router.get('/deposit-methods', requireAuth, listDepositMethods);
router.get('/deposits/mine', requireAuth, myDeposits);

router.post(
  '/transfers',
  requireAuth,
  [
    body('amount').isFloat({ gt: 0 }),
    body('idempotencyKey').isString().trim().notEmpty().withMessage('Missing idempotency key.'),
  ],
  handleValidationErrors,
  requireFaceVerification('wallet_transfer'),
  createTransfer
);
router.get('/transfers/mine', requireAuth, myTransfers);

export default router;
