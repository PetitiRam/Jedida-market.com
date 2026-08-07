import express from 'express';
import { param, body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import { getStats, listSubmissions, getSubmission, reviewSubmission, addNote } from '../controllers/adminKycController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireAdmin, requirePermission('upgrades'));

router.get('/stats', getStats);
router.get('/submissions', listSubmissions);
router.get('/submissions/:id', [param('id').isUUID().withMessage('Invalid submission id.')], handleValidationErrors, getSubmission);
router.patch(
  '/submissions/:id',
  [
    param('id').isUUID().withMessage('Invalid submission id.'),
    body('action').isIn(['approve', 'reject', 'request_info', 'suspend', 'escalate', 'assign']).withMessage('Invalid action.'),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }).withMessage('Notes must be 2000 characters or fewer.'),
    body('assignTo').optional({ nullable: true }).isUUID().withMessage('Invalid assignee id.'),
  ],
  handleValidationErrors,
  reviewSubmission
);
router.post(
  '/submissions/:id/notes',
  [param('id').isUUID().withMessage('Invalid submission id.'), body('note').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Note must be 1-2000 characters.')],
  handleValidationErrors,
  addNote
);

export default router;
