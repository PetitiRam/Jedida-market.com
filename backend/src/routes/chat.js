import express from 'express';
import { myThread, sendAsUser, listThreads, adminThreadMessages, sendAsAdmin } from '../controllers/chatController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/mine', requireAuth, myThread);
router.post('/mine', requireAuth, sendAsUser);

router.get('/threads', requireAuth, requireAdmin, requirePermission('chat'), listThreads);
router.get('/threads/:userId', requireAuth, requireAdmin, requirePermission('chat'), adminThreadMessages);
router.post('/threads/:userId', requireAuth, requireAdmin, requirePermission('chat'), sendAsAdmin);

export default router;
