import express from 'express';
import * as ctrl from '../controllers/providerRegistryController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Seller-facing — connect/disconnect the payment methods already approved
// and active in the registry for their own shop.
router.get('/mine', requireAuth, ctrl.listMyProviderConnections);
router.post('/mine/:providerId/connect', requireAuth, ctrl.connectProvider);
router.post('/mine/:providerId/disconnect', requireAuth, ctrl.disconnectProvider);

// Public — buyers/checkout need to know which methods a specific shop has
// actually connected, before requireAuth locks down the seller routes above.
router.get('/shop/:shopId', ctrl.getShopConnectedProviders);

// Admin — registry management + approval lifecycle. Uses the same
// 'withdrawals' permission area as AdminPayments/AdminWithdrawals since
// this is the same finance surface.
router.use('/admin', requireAuth, requireAdmin, requirePermission('withdrawals'));
router.get('/admin', ctrl.listProviders);
router.post('/admin', ctrl.createProvider);
router.get('/admin/:id/history', ctrl.getProviderHistory);
router.patch('/admin/:id/status', ctrl.updateProviderStatus);

export default router;
