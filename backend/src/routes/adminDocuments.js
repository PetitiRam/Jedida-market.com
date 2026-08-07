import express from 'express';
import * as ctrl from '../controllers/adminDocumentsController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Documents/receipts/invoices are financial records, so they're gated the
// same way the rest of admin payments/withdrawals are (finance sub-role or
// super admin) — see ADMIN_ROLE_PERMISSIONS in middleware/auth.js.
router.use(requireAuth, requirePermission('payments'));

router.get('/audit-summary', ctrl.auditSummary);
router.get('/disputes', ctrl.listDisputes);
router.patch('/disputes/:id', ctrl.resolveDispute);
router.get('/:id', ctrl.getDocument);
router.post('/:id/verify', ctrl.markVerifiedByAdmin);
router.post('/:id/void', ctrl.voidDocument);
router.get('/', ctrl.listDocuments);

export default router;
