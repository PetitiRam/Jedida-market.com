import express from 'express';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import {
  listPlans, mySubscription, subscribe, cancelSubscription, addStaffSeat, removeStaffSeat,
  storeDescription, productAssist, analytics, marketingGenerate, salesInsights, draftCustomerReply,
  testForbiddenAction, fileComplaint,
  adminListSubscriptions, adminActivityLog, adminListPlans, adminUpdatePlan,
  adminListComplaints, adminResolveComplaint,
} from '../controllers/aiHandlerController.js';

const router = express.Router();
router.use(requireAuth);

// Plans + subscription
router.get('/plans', listPlans);
router.get('/subscription', mySubscription);
router.post('/subscription', subscribe);
router.delete('/subscription', cancelSubscription);
router.post('/staff-seats', addStaffSeat);
router.delete('/staff-seats/:seatId', removeStaffSeat);

// AI store management
router.post('/store-description', storeDescription);
router.post('/product-assist', productAssist);
router.get('/analytics', analytics);
router.post('/marketing/generate', marketingGenerate);
router.get('/sales-insights', salesInsights);

// AI customer communication assistant
router.post('/customer-reply', draftCustomerReply);

// Security self-test + complaints
router.post('/security/test-forbidden-action', testForbiddenAction);
router.post('/complaints', fileComplaint);

// Admin oversight — mounted separately below under /api/admin/ai-handler
export const adminAiHandlerRouter = express.Router();
adminAiHandlerRouter.use(requireAuth, requireAdmin, requirePermission('ai_handler'));
adminAiHandlerRouter.get('/subscriptions', adminListSubscriptions);
adminAiHandlerRouter.get('/activity-log', adminActivityLog);
adminAiHandlerRouter.get('/plans', adminListPlans);
adminAiHandlerRouter.patch('/plans/:id', adminUpdatePlan);
adminAiHandlerRouter.get('/complaints', adminListComplaints);
adminAiHandlerRouter.patch('/complaints/:id', adminResolveComplaint);

export default router;
