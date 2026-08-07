import express from 'express';
import * as ctrl from '../controllers/couponsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.post('/', requireAuth, ctrl.createCoupon);
router.get('/mine', requireAuth, ctrl.myCoupons);
router.post('/validate', requireAuth, ctrl.validateCoupon);

export default router;
