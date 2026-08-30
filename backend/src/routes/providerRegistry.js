import express from 'express';
import * as ctrl from '../controllers/providerRegistryController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Seller-facing — connect/disconnect the payment methods already approved
// and active in the registry for their own shop.
router.get('/mine', requireAuth, ctrl.listMyProviderConnections);
router.post('/mine/:providerId/connect', requireAuth, ctrl.connectProvider);
router.post('/mine/:providerId/disconnect', requireAuth, ctrl.disconnectProvider);

// Seller-facing — per-method activation nested under a connected provider
// (phase 95): PesaJet -> [MTN Mobile Money, Airtel Money], each toggled
// individually rather than the provider being one flat on/off switch.
router.get('/mine/methods', requireAuth, ctrl.listMyProviderMethods);
router.post('/mine/methods/:methodId/activate', requireAuth, ctrl.activateProviderMethod);
router.post('/mine/methods/:methodId/deactivate', requireAuth, ctrl.deactivateProviderMethod);

// Public — buyers/checkout need to know which methods a specific shop has
// actually connected, before requireAuth locks down the seller routes above.
router.get('/shop/:shopId', ctrl.getShopConnectedProviders);
router.get('/shop/:shopId/methods', ctrl.getShopEnabledMethods);

// Admin — registry management + approval lifecycle. Uses the same
// 'withdrawals' permission area as AdminPayments/AdminWithdrawals since
// this is the same finance surface.
router.use('/admin', requireAuth, requireAdmin, requirePermission('withdrawals'));
router.get('/admin', ctrl.listProviders);
router.post('/admin', ctrl.createProvider);
router.get('/admin/:id/history', ctrl.getProviderHistory);
router.patch('/admin/:id/status', ctrl.updateProviderStatus);

export default router;
