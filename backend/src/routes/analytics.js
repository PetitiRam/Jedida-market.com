import express from 'express';
import {
  getOrderMetrics, getQuoteConversionMetrics, getDemandMetrics,
  getDisputeMetrics, getAgentPerformance, getSupplierPerformance, getDropshipperPerformance
} from '../controllers/analyticsController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Gated under the existing 'orders' permission area (covers staff and
// finance sub-roles, plus super_admin) rather than adding a new area to
// ADMIN_ROLE_PERMISSIONS — this is read-only reporting, not a new
// capability that needs its own permission grant.
router.get('/orders', requireAuth, requirePermission('orders'), getOrderMetrics);
router.get('/quote-conversion', requireAuth, requirePermission('orders'), getQuoteConversionMetrics);
router.get('/demand', requireAuth, requirePermission('orders'), getDemandMetrics);
router.get('/disputes', requireAuth, requirePermission('orders'), getDisputeMetrics);
router.get('/agent-performance', requireAuth, requirePermission('orders'), getAgentPerformance);
router.get('/supplier-performance', requireAuth, requirePermission('orders'), getSupplierPerformance);
router.get('/dropshipper-performance', requireAuth, requirePermission('orders'), getDropshipperPerformance);

export default router;
