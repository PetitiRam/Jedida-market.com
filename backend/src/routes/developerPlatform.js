import express from 'express';
import {
  getMe, register, getCatalog, createOrganization, listMyOrganizations, inviteMember, listMembers,
  adminListDevelopers, adminReviewDeveloper, adminListOrganizations, adminReviewOrganization,
} from '../controllers/developerPlatformController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

// User-facing — mounted at /api/dev. Any signed-in user can view/apply;
// approval status gates the rest (see developerPlatformController.js).
const router = express.Router();
router.use(requireAuth);
router.get('/me', getMe);
router.post('/register', register);
router.get('/catalog', getCatalog);
router.post('/organizations', createOrganization);
router.get('/organizations', listMyOrganizations);
router.post('/organizations/:orgId/members', inviteMember);
router.get('/organizations/:orgId/members', listMembers);

// Admin review queue — mounted separately below under /api/admin/dev,
// gated the same way partners/affiliates are: an admin whose sub-role
// covers 'developer_platform' (or a super admin) can approve/reject/suspend.
export const adminDeveloperPlatformRouter = express.Router();
adminDeveloperPlatformRouter.use(requireAuth, requireAdmin);
adminDeveloperPlatformRouter.get('/developers', requirePermission('developer_platform'), adminListDevelopers);
adminDeveloperPlatformRouter.post('/developers/:id/review', requirePermission('developer_platform'), adminReviewDeveloper);
adminDeveloperPlatformRouter.get('/organizations', requirePermission('developer_platform'), adminListOrganizations);
adminDeveloperPlatformRouter.post('/organizations/:id/review', requirePermission('developer_platform'), adminReviewOrganization);

export default router;
