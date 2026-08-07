import express from 'express';
import {
  getMyReferralInfo, getMyWallet, getMyCommissions, getMyReferrals, getMyWithdrawals, postWithdrawal,
  adminGetOverview, adminGetReferrals, adminGetHeldCommissions, adminPostCommissionReview,
  adminGetWithdrawals, adminPostWithdrawalReview
} from '../controllers/affiliateController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import { withdrawalsGate } from '../middleware/platformLockdown.js';

// User-facing — mounted at /api/affiliate. Any signed-in user has a
// referral code/link/wallet, regardless of role (buyer, seller, etc).
const router = express.Router();
router.use(requireAuth);
router.get('/me', getMyReferralInfo);
router.get('/wallet', getMyWallet);
router.get('/commissions', getMyCommissions);
router.get('/referrals', getMyReferrals);
router.get('/withdrawals', getMyWithdrawals);
router.post('/withdrawals', withdrawalsGate, postWithdrawal);

// Admin: overview + review queues — mounted separately below under
// /api/admin/affiliate, gated the same way partners/withdrawals are.
export const adminAffiliateRouter = express.Router();
adminAffiliateRouter.use(requireAuth, requireAdmin);
adminAffiliateRouter.get('/overview', requirePermission('affiliates'), adminGetOverview);
adminAffiliateRouter.get('/referrals', requirePermission('affiliates'), adminGetReferrals);
adminAffiliateRouter.get('/commissions/held', requirePermission('affiliates'), adminGetHeldCommissions);
adminAffiliateRouter.post('/commissions/:id/review', requirePermission('affiliates'), adminPostCommissionReview);
adminAffiliateRouter.get('/withdrawals', requirePermission('affiliates'), adminGetWithdrawals);
adminAffiliateRouter.post('/withdrawals/:id/review', requirePermission('affiliates'), adminPostWithdrawalReview);

export default router;
