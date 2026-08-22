import express from 'express';
import {
  whatsappWebhookVerify, whatsappWebhookReceive, emailWebhookReceive,
  listThreads, getThreadTimeline, assignThread, resolveThread, sendThreadReply
} from '../controllers/omnichannelController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// ---- Webhooks — no auth; secured by Meta's verify-token handshake /
// provider-side shared secret instead, same as any inbound webhook ----
router.get('/whatsapp/webhook', whatsappWebhookVerify);
router.post('/whatsapp/webhook', whatsappWebhookReceive);
router.post('/email/webhook', emailWebhookReceive);

// ---- Agent inbox — gated to admins whose sub-role covers 'chat'
// (support, chat_assistant, business_rep, security_agent, super_admin) ----
router.get('/threads', requireAuth, requirePermission('chat'), listThreads);
router.get('/threads/:id', requireAuth, requirePermission('chat'), getThreadTimeline);
router.patch('/threads/:id/assign', requireAuth, requirePermission('chat'), assignThread);
router.patch('/threads/:id/resolve', requireAuth, requirePermission('chat'), resolveThread);
router.post('/threads/:id/reply', requireAuth, requirePermission('chat'), sendThreadReply);

export default router;
