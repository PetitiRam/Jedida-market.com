import express from 'express';
import * as ctrl from '../controllers/aiTrainingContributionsController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Business owners submitting product/business FAQs or knowledge suggestions.
// Open to any signed-in user (sellers, manufacturers, suppliers, admins) —
// nothing here reaches the AI until an admin approves it.
router.post('/suggestions', requireAuth, ctrl.submitSuggestion);
router.get('/suggestions/mine', requireAuth, ctrl.mySuggestions);

// Support staff correcting a specific AI reply — gated to admins whose
// sub-role covers 'chat' (support, chat_assistant, security_agent,
// business_rep) or a super admin, same as the rest of the support tooling.
router.post('/corrections', requireAuth, requirePermission('chat'), ctrl.submitCorrection);

// Thumbs-up / thumbs-down after any AI conversation — open to any signed-in
// buyer or seller.
router.post('/feedback', requireAuth, ctrl.submitFeedback);

export default router;
