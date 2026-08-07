import express from 'express';
import {
  requestPartnership, myPartnerships, respondPartnership,
  listDropshipBusinesses,
  browseDropshipCatalog, requestProductAccess, respondProductAccess,
  myProductAccess, incomingProductAccess, toggleDropshippable,
  addMarketingAsset, listMarketingAssets, deleteMarketingAsset,
  createDropshipOrder, releaseDropshipCommission, reverseDropshipCommission,
  getAccessForCheckout,
  salesDashboard, dropshipperPerformance, myAuditLog,
  DROPSHIPPER_ROLES, BUSINESS_ROLES
} from '../controllers/dropshipController.js';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// ---- Partnerships ----
// Either side may request/respond in some paths, so only requireAuth at the
// route level; ownership + who-can-set-what is enforced in the controller.
router.get('/businesses', requireAuth, requireRole(...DROPSHIPPER_ROLES), listDropshipBusinesses);
router.post('/partnerships', requireAuth, requireRole(...DROPSHIPPER_ROLES), requestPartnership);
router.get('/partnerships', requireAuth, myPartnerships);
router.patch('/partnerships/:id', requireAuth, respondPartnership);

// ---- Catalog + product access ----
router.get('/catalog', requireAuth, requireRole(...DROPSHIPPER_ROLES), browseDropshipCatalog);
router.post('/product-access', requireAuth, requireRole(...DROPSHIPPER_ROLES), requestProductAccess);
router.get('/product-access/mine', requireAuth, requireRole(...DROPSHIPPER_ROLES), myProductAccess);
router.get('/product-access/incoming', requireAuth, requireRole(...BUSINESS_ROLES), incomingProductAccess);
router.patch('/product-access/:id', requireAuth, requireRole(...BUSINESS_ROLES), respondProductAccess);
router.patch('/products/:productId/dropshippable', requireAuth, requireRole(...BUSINESS_ROLES), toggleDropshippable);

// ---- Marketing materials ----
router.post('/products/:productId/marketing-assets', requireAuth, requireRole(...BUSINESS_ROLES), addMarketingAsset);
router.get('/products/:productId/marketing-assets', requireAuth, listMarketingAssets);
router.delete('/marketing-assets/:assetId', requireAuth, requireRole(...BUSINESS_ROLES), deleteMarketingAsset);

// ---- Orders + commission release ----
// Any authenticated buyer purchasing through a dropshipper's resale link —
// not role-gated to a specific account type.
router.get('/access/:id', requireAuth, getAccessForCheckout);
router.post('/orders', requireAuth, createDropshipOrder);
router.post('/orders/:orderId/release-commission', requireAuth, requirePermission('orders'), releaseDropshipCommission);
router.post('/orders/:orderId/reverse-commission', requireAuth, requirePermission('orders'), reverseDropshipCommission);

// ---- Dashboards ----
router.get('/dashboard', requireAuth, requireRole(...DROPSHIPPER_ROLES), salesDashboard);
router.get('/dropshippers/:dropshipperId/performance', requireAuth, requireRole(...BUSINESS_ROLES), dropshipperPerformance);

// ---- Audit log ----
router.get('/audit-log', requireAuth, myAuditLog);

export default router;
