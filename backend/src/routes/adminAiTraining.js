import express from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/aiTrainingController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { multerErrorHandler } from '../middleware/multerErrorHandler.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = express.Router();

router.use(requireAuth, requirePermission('ai'));

// Knowledge Library
router.get('/knowledge', ctrl.listKnowledge);
router.get('/knowledge/:id', ctrl.getKnowledgeItem);
router.post('/knowledge', ctrl.createKnowledgeItem);
router.patch('/knowledge/:id', ctrl.updateKnowledgeItem);
router.post('/knowledge/:id/submit-review', ctrl.submitForReview);
router.post('/knowledge/:id/review', ctrl.reviewKnowledgeItem);
router.post('/knowledge/:id/archive', ctrl.archiveKnowledgeItem);
router.post('/knowledge/:id/new-version', ctrl.createNewVersion);
router.post('/knowledge/upload', upload.single('file'), multerErrorHandler, ctrl.uploadKnowledgeFile);

// Published Knowledge (what the AI currently draws on)
router.get('/published', ctrl.listPublishedKnowledge);

// AI Learning Jobs / Training History
router.get('/jobs', ctrl.listTrainingJobs);
router.post('/jobs', ctrl.createTrainingJob);
router.get('/jobs/:id', ctrl.getTrainingJob);

// Pending Approval — suggestions + corrections
router.get('/pending-approval', ctrl.listPendingApprovals);
router.patch('/suggestions/:id', ctrl.reviewSuggestion);
router.patch('/corrections/:id', ctrl.reviewCorrection);

// Suggested Knowledge / knowledge gaps
router.get('/gaps', ctrl.listKnowledgeGaps);
router.patch('/gaps/:id/dismiss', ctrl.dismissKnowledgeGap);

// Performance Reports
router.get('/performance', ctrl.performanceReport);

export default router;
