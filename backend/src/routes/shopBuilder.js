import express from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  getBuilderState, updateTheme,
  addBlock, updateBlock, deleteBlock, duplicateBlock, reorderBlocks,
  previewBlocks, publishBlocks,
  aiDesignStore, reportShopContent,
  trackShopEvent, getShopAnalytics, getBusinessInsights
} from '../controllers/shopBuilderController.js';

const router = express.Router();

router.get('/me', requireAuth, getBuilderState);
router.patch('/me/theme', requireAuth, updateTheme);

router.post('/me/blocks', requireAuth, addBlock);
router.patch('/me/blocks/reorder', requireAuth, reorderBlocks);
router.patch('/me/blocks/:id', requireAuth, updateBlock);
router.delete('/me/blocks/:id', requireAuth, deleteBlock);
router.post('/me/blocks/:id/duplicate', requireAuth, duplicateBlock);

router.get('/me/preview', requireAuth, previewBlocks);
router.post('/me/publish', requireAuth, publishBlocks);

router.post('/me/ai-design', requireAuth, aiDesignStore);

router.post('/report', requireAuth, reportShopContent);

router.post('/track', optionalAuth, trackShopEvent);
router.get('/me/analytics', requireAuth, getShopAnalytics);
router.get('/me/business-insights', requireAuth, getBusinessInsights);

export default router;
