import express from 'express';
import { requireAuth, requireAdmin, requirePermission, requireSuperAdmin } from '../middleware/auth.js';
import {
  createRepresentative, listRepresentatives, updateRepresentativeStatus,
  assignRepresentative, endAssignment, listAllAssignments,
  listEscalations, resolveEscalation,
  requireActiveRepresentative, myAssignments, businessOverview, logActivity, createEscalation,
} from '../controllers/representativeController.js';

const router = express.Router();
router.use(requireAuth);

// Representative self-service — mounted at /api/representatives
router.use('/me', requireActiveRepresentative);
router.get('/me/assignments', myAssignments);
router.get('/me/businesses/:businessUserId', businessOverview);
router.post('/me/businesses/:businessUserId/activity', logActivity);
router.post('/me/escalations', createEscalation);

// Admin: roster + assignment management — mounted separately below under
// /api/admin/representatives
export const adminRepresentativeRouter = express.Router();
adminRepresentativeRouter.use(requireAuth, requireAdmin, requirePermission('representatives'));
adminRepresentativeRouter.get('/', listRepresentatives);
// Creating a representative and reactivating a suspended one both grant
// the business_rep admin sub-role (see representativeController.js) —
// that's an admin-access grant, not a representatives-roster edit, so it
// requires super admin on top of the 'representatives' permission every
// other route on this router accepts. Previously any admin sub-role with
// 'representatives' access (e.g. 'approvals') could mint new admin
// accounts through this endpoint — the same privilege only a super admin
// should have per "Only Super Administrators may... Promote
// Administrators."
adminRepresentativeRouter.post('/', requireSuperAdmin, createRepresentative);
adminRepresentativeRouter.patch('/:id/status', requireSuperAdmin, updateRepresentativeStatus);
adminRepresentativeRouter.post('/:id/assignments', assignRepresentative);
adminRepresentativeRouter.patch('/assignments/:assignmentId/end', endAssignment);
adminRepresentativeRouter.get('/assignments', listAllAssignments);
adminRepresentativeRouter.get('/escalations', listEscalations);
adminRepresentativeRouter.patch('/escalations/:id/resolve', resolveEscalation);

export default router;
