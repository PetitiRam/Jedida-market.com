import express from 'express';
import { param, query as queryValidator } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import {
  listTransactions, getTransactionByReference, getOrderFinancialState,
  getOverview, getProviderHealth, listReleaseEligibleOrders, listFinanceTeam,
} from '../controllers/ledgerController.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Read access: every finance workspace role has 'ledger' (see
// ADMIN_ROLE_PERMISSIONS in middleware/auth.js) — a Finance Viewer can see
// the same transaction stream a Finance Administrator can, just nothing
// with an action attached to it.
router.get('/overview', requirePermission('ledger'), getOverview);
router.get(
  '/transactions',
  requirePermission('ledger'),
  [queryValidator('limit').optional().isInt({ min: 1, max: 200 })],
  handleValidationErrors,
  listTransactions
);
router.get(
  '/transactions/:reference',
  requirePermission('ledger'),
  [param('reference').isString().trim().notEmpty()],
  handleValidationErrors,
  getTransactionByReference
);
router.get(
  '/orders/:publicRef/financial-state',
  requirePermission('ledger'),
  [param('publicRef').isString().trim().isLength({ min: 6, max: 6 }).withMessage('Order reference must be six characters.')],
  handleValidationErrors,
  getOrderFinancialState
);

// Provider health needs the 'providers' area — Payment Operations and
// Reconciliation Officers have it; a Refund Officer or Finance Viewer does
// not (they don't need to know a provider is degraded to do their job).
router.get('/providers/health', requirePermission('providers'), getProviderHealth);

// Releases workspace — Settlement Officer and Finance Admin only.
router.get('/releases/eligible', requirePermission('releases'), listReleaseEligibleOrders);

// Team management view — Finance Admin only (the same role allowed to
// grant/revoke finance roles via the existing /admin/users/:id/role route).
router.get('/team', requirePermission('finance_team'), listFinanceTeam);

export default router;
