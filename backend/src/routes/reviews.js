import express from 'express';
import * as ctrl from '../controllers/reviewsController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/:productId/reviews', ctrl.listReviews);
router.post('/:productId/reviews', requireAuth, ctrl.createReview);
router.post('/reviews/:reviewId/helpful', requireAuth, ctrl.markHelpful);
router.post('/reviews/:reviewId/reply', requireAuth, ctrl.replyToReview);

router.get('/:productId/questions', ctrl.listQuestions);
router.post('/:productId/questions', requireAuth, ctrl.askQuestion);

router.get('/admin/questions/pending', requireAuth, requireAdmin, requirePermission('products'), ctrl.listPendingQuestions);
router.post('/admin/questions/:questionId/forward', requireAuth, requireAdmin, requirePermission('products'), ctrl.forwardToSeller);
router.post('/admin/questions/:questionId/answer', requireAuth, requireAdmin, requirePermission('products'), ctrl.postAnswer);

export default router;
