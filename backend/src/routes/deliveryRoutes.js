import express from 'express';
import * as ctrl from '../controllers/deliveryController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.post('/drivers/register', requireAuth, ctrl.registerDriver);
router.get('/drivers/me', requireAuth, ctrl.myDriverProfile);
router.get('/drivers', requireAuth, requireAdmin, requirePermission('delivery'), ctrl.listDrivers);

router.post('/', requireAuth, requireAdmin, requirePermission('delivery'), ctrl.createDelivery);
router.post('/:id/assign-driver', requireAuth, requireAdmin, requirePermission('delivery'), ctrl.assignDriver);
router.post('/:id/status', requireAuth, ctrl.updateStatus);
router.post('/:id/location', requireAuth, ctrl.updateLocation);
router.get('/:id/timeline', requireAuth, ctrl.getTimeline);
router.get('/by-order/:orderId', requireAuth, ctrl.getByOrder);
router.get('/mine/driver', requireAuth, ctrl.myDriverDeliveries);
router.get('/all', requireAuth, requireAdmin, requirePermission('delivery'), ctrl.allDeliveries);

export default router;
