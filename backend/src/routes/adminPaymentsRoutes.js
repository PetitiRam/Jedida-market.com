import express from "express";
import { param, body } from "express-validator";
import { handleValidationErrors } from "../middleware/validate.js";

import {
  getPendingPayments,
  approvePayment,
  rejectPayment
} from "../controllers/adminPaymentsController.js";

import {
  requireAuth,
  requireAdmin,
  requirePermission
} from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireAdmin, requirePermission('withdrawals'));

router.get("/pending", getPendingPayments);
router.post(
  "/:paymentId/approve",
  [param('paymentId').isUUID().withMessage('Invalid payment id.')],
  handleValidationErrors,
  approvePayment
);
router.post(
  "/:paymentId/reject",
  [
    param('paymentId').isUUID().withMessage('Invalid payment id.'),
    body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 500 }).withMessage('Reason must be 500 characters or fewer.'),
  ],
  handleValidationErrors,
  rejectPayment
);

export default router;
