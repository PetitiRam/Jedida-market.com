import express from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { postAssistantChat, postAssistantTeach } from '../controllers/aiAssistantController.js';

const router = express.Router();

router.post('/chat', requireAuth, postAssistantChat);

// Admin Learning Mode — same widget, gated to admins with AI Training
// Center access (same 'ai' permission area used elsewhere).
router.post('/teach', requireAuth, requirePermission('ai'), postAssistantTeach);

export default router;
