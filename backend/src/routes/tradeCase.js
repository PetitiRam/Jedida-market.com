import express from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { viewTradeCase, addTradeCaseEvent, adminAssignTradeCase } from '../controllers/tradeCaseController.js';

const router = express.Router();

router.get('/:orderId', requireAuth, viewTradeCase);
router.post('/:orderId/events', requireAuth, addTradeCaseEvent);
// 'orders' area already covers staff/finance/approvals admin sub-roles.
router.post('/:orderId/assign', requireAuth, requirePermission('orders'), adminAssignTradeCase);

export default router;
