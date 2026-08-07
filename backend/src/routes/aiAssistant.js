import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { postAssistantChat } from '../controllers/aiAssistantController.js';

const router = express.Router();

router.post('/chat', requireAuth, postAssistantChat);

export default router;
