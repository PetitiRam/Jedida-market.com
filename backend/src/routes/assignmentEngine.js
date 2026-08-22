import express from 'express';
import {
  createCustomerGroup, listCustomerGroups, updateCustomerGroup,
  addAgentToGroup, removeAgentFromGroup, addCustomerToGroup, removeCustomerFromGroup, listGroupMembers,
  assignEntity, unassignEntity, getEntityAssignmentHistory, myOpenAssignments
} from '../controllers/assignmentEngineController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// ---- Customer groups (org structure) ----
router.post('/groups', requireAuth, requirePermission('users'), createCustomerGroup);
router.get('/groups', requireAuth, requirePermission('users'), listCustomerGroups);
router.patch('/groups/:id', requireAuth, requirePermission('users'), updateCustomerGroup);
router.get('/groups/:id/members', requireAuth, requirePermission('users'), listGroupMembers);
router.post('/groups/:id/agents', requireAuth, requirePermission('users'), addAgentToGroup);
router.delete('/groups/:id/agents/:agentId', requireAuth, requirePermission('users'), removeAgentFromGroup);
router.post('/groups/:id/customers', requireAuth, requirePermission('users'), addCustomerToGroup);
router.delete('/groups/:id/customers/:customerId', requireAuth, requirePermission('users'), removeCustomerFromGroup);

// ---- Generic assignment engine ----
router.post('/assign', requireAuth, requirePermission('users'), assignEntity);
router.post('/unassign', requireAuth, requirePermission('users'), unassignEntity);
router.get('/history', requireAuth, requirePermission('users'), getEntityAssignmentHistory);

// ---- Any admin/agent can see their own current workload ----
router.get('/mine', requireAuth, myOpenAssignments);

export default router;
