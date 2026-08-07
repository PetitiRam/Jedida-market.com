import express from 'express';
// add forceLogoutAllUsers to the existing import from adminController.js
import { param, body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import { requireFaceVerification } from '../middleware/faceVerification.js';
import {
  listUsers, updateUserStatus, assignAdminRole, revokeAdminRole, listAdmins, getUserDetail, listKycSubmissions, reviewKyc,
  listPendingShops, reviewShop, listAllShops, updateShopStatus, listPendingProducts, reviewProduct,
  listAllProducts, toggleProductFeature, deleteProductAsAdmin,
  createAd, listActiveAds, updateAd, deleteAd, getSettings, updateSettings, platformWalletSummary,
  forceLogoutAllUsers, getDashboardSummary, getMissionControl,
  updateBusinessVerificationLevel, listBusinessVerificationLevels,
  listAdminRoleDefinitions, listRoleActivity
} from '../controllers/adminController.js';

import { listUpgrades, reviewUpgrade, getUpgradeHistory } from '../controllers/upgradeController.js';
import {
  listVerifiedShops, getShopVerificationDetail, overrideShopVerification,
  recomputeShopVerification, recomputeAllShopVerification,
  listRiskSignals, resolveRiskSignal, rescanShopProtection
} from '../controllers/verifiedShopController.js';
import { adminListPosts, adminRemovePost, adminRestorePost } from '../controllers/shopFeedController.js';
import { getAdminGrowthOverview } from '../controllers/growthController.js';
import { listWithdrawals, reviewWithdrawal } from '../controllers/walletsController.js';
import { requireAuth, requireAdmin, requireSuperAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Dashboard overview — every admin role lands here first; the payload is
// shaped once and the frontend picks which cards to show per role.
router.get('/dashboard-summary', getDashboardSummary);

// Mission Control — the redesigned dashboard landing screen. Same
// requireAuth/requireAdmin gate as everything else in this router; the
// frontend hides it from narrower admin_role users and falls back to
// dashboard-summary for them.
router.get('/mission-control', getMissionControl);

// Users — 'users' permission required for any admin sub-role to reach
// these at all (previously gated only by "is any kind of admin", which
// meant e.g. a chat_assistant-tier admin could list every account's
// admin status or suspend a super admin — see auth.js's
// isSuperAdminAccount/updateUserStatus for the rest of that fix).
router.get('/users', requirePermission('users'), listUsers);
router.get('/users/:userId', requirePermission('users'), [param('userId').isUUID().withMessage('Invalid user id.')], handleValidationErrors, getUserDetail);
router.patch(
  '/users/:userId/status',
  requirePermission('users'),
  [
    param('userId').isUUID().withMessage('Invalid user id.'),
    body('status').isIn(['active', 'suspended', 'rejected']).withMessage('Status must be "active", "suspended", or "rejected".'),
  ],
  handleValidationErrors,
  updateUserStatus
);
router.post(
  '/users/:userId/make-admin',
  requireSuperAdmin,
  [
    param('userId').isUUID().withMessage('Invalid user id.'),
    body('role').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
  ],
  handleValidationErrors,
  requireFaceVerification('admin_role_grant'),
  assignAdminRole
);
router.post('/users/:userId/revoke-admin', requireSuperAdmin, [param('userId').isUUID().withMessage('Invalid user id.')], handleValidationErrors, revokeAdminRole);
router.get('/roles/admins', requireSuperAdmin, listAdmins);
router.get('/roles/definitions', requireSuperAdmin, listAdminRoleDefinitions);
router.get('/roles/activity', requireSuperAdmin, listRoleActivity);

// Role upgrades — payment verification, KYC review, final approval.
// Single endpoint drives every stage via `action` in the body:
// verify_payment | reject_payment | verify_kyc | reject_kyc | approve | reject
router.get('/upgrades', requirePermission('upgrades'), listUpgrades);
router.get('/upgrades/:id/history', requirePermission('upgrades'), getUpgradeHistory);
router.patch('/upgrades/:id', requirePermission('upgrades'), reviewUpgrade);

// Business trust tier — sits above the upgrade approval lifecycle.
router.get('/business-verification-levels', requirePermission('upgrades'), listBusinessVerificationLevels);
router.patch('/business-verification-levels/:businessProfileId', requirePermission('upgrades'), updateBusinessVerificationLevel);

// Verified Shop trust engine (schema_phase59) — automatic badge shown on
// every shop, distinct from the manual business-verification tier above.
router.get('/verified-shops', requirePermission('shops'), listVerifiedShops);
router.get('/verified-shops/:shopId', requirePermission('shops'), getShopVerificationDetail);
router.post('/verified-shops/:shopId/override', requirePermission('shops'), overrideShopVerification);
router.post('/verified-shops/:shopId/recompute', requirePermission('shops'), recomputeShopVerification);
router.post('/verified-shops/recompute-all', requirePermission('shops'), recomputeAllShopVerification);

// AI Protection (schema_phase60) — fake-follower/fake-review/quality-decline
// risk signal queue. Suspicious-order detections go to the existing
// /trust-security/admin/fraud-flags queue instead (see aiProtectionService.js).
router.get('/risk-signals', requirePermission('shops'), listRiskSignals);
router.patch('/risk-signals/:signalId', requirePermission('shops'), resolveRiskSignal);
router.post('/verified-shops/:shopId/rescan-protection', requirePermission('shops'), rescanShopProtection);

// Verified Shop Feed moderation (schema_phase61)
router.get('/shop-feed/posts', requirePermission('shops'), adminListPosts);
router.patch('/shop-feed/posts/:postId/remove', requirePermission('shops'), adminRemovePost);
router.patch('/shop-feed/posts/:postId/restore', requirePermission('shops'), adminRestorePost);

// Growth Benefits (schema_phase62) — Growth Hub usage overview: verified
// shop count, recent discount campaigns / promo posts, top-trust shops.
router.get('/growth/overview', requirePermission('shops'), getAdminGrowthOverview);

// Shops & products (unrelated to the upgrade lifecycle — separate approval queue)
router.get('/shops/pending', requirePermission('shops'), listPendingShops);
router.get('/shops', requirePermission('shops'), listAllShops);
router.post('/shops/:id/review', requirePermission('shops'), reviewShop);
router.patch('/shops/:id/status', requirePermission('shops'), updateShopStatus);
router.get('/products/pending', requirePermission('products'), listPendingProducts);
router.post('/products/:id/review', requirePermission('products'), reviewProduct);
router.get('/products', requirePermission('products'), listAllProducts);
router.patch('/products/:id/feature', requirePermission('products'), toggleProductFeature);
router.delete('/products/:id', requirePermission('products'), deleteProductAsAdmin);

// Ads
router.get('/ads', requirePermission('ads'), listActiveAds);
router.post('/ads', requirePermission('ads'), createAd);
router.patch('/ads/:id', requirePermission('ads'), updateAd);
router.delete('/ads/:id', requirePermission('ads'), deleteAd);

// Withdrawals
router.get('/withdrawals', requirePermission('withdrawals'), listWithdrawals);
router.post(
  '/withdrawals/:id/review',
  requirePermission('withdrawals'),
  [
    param('id').isUUID().withMessage('Invalid withdrawal id.'),
    body('decision').isIn(['approve', 'reject']).withMessage('Decision must be "approve" or "reject".'),
  ],
  handleValidationErrors,
  reviewWithdrawal
);

// Platform settings & wallet summary — super admin only, since these affect
// the whole platform rather than one functional area.
router.get('/settings', getSettings);
router.patch('/settings', requireSuperAdmin, updateSettings);
router.get('/wallet-summary', requirePermission('wallets'), platformWalletSummary);
router.post('/security/force-logout-all', requireSuperAdmin, forceLogoutAllUsers);
export default router;
