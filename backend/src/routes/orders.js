import express from 'express';
import multer from 'multer';
import {
  createOrder, confirmPayment, confirmDelivery, releaseFunds, autoReleaseExpiredEscrow,
  myOrdersAsBuyer, myOrdersAsSeller, myOrdersAsDelivery, allOrders,cancelOrder,reorder,getReceipt,contactSellerAboutOrder,submitManualPayment, assignDelivery, adminRefundOrder,
  checkPesajetStatus
} from '../controllers/ordersController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import { checkoutCart, confirmCartPayment } from '../controllers/ordersController.js';
import { paymentsGate } from '../middleware/platformLockdown.js';
import { requireFaceVerification } from '../middleware/faceVerification.js';
import { multerErrorHandler } from '../middleware/multerErrorHandler.js';
import {
  uploadPackagingEvidence, listPackagingEvidence, supersedePackagingEvidence,
  markHandedToLogistics, getPackagingRequirements,
} from '../controllers/packagingEvidenceController.js';

// Payment proof screenshots — same 8MB image ceiling as every other
// image upload on the platform (see uploadSecurity.js FILE_CATEGORIES).
const uploadProof = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const uploadPackagingImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const router = express.Router();

router.post('/', requireAuth, createOrder);
router.post('/:orderId/confirm-payment', requireAuth, paymentsGate, confirmPayment);
router.post('/:orderId/confirm-delivery', requireAuth, confirmDelivery);
router.post('/:orderId/release-funds', requireAuth, requireAdmin, requirePermission('orders'), releaseFunds);
router.post('/escrow/auto-release', requireAuth, requireAdmin, requirePermission('orders'), autoReleaseExpiredEscrow);
router.post('/:orderId/assign-delivery', requireAuth, requireAdmin, requirePermission('orders'), assignDelivery);
router.post('/:orderId/admin-refund', requireAuth, requireAdmin, requirePermission('orders'), requireFaceVerification('admin_refund'), adminRefundOrder);
router.post('/:orderId/pesajet/check-status', requireAuth, requireAdmin, requirePermission('withdrawals'), checkPesajetStatus);

// Packaging evidence (spec #21-26) — seller uploads, buyer/seller/admin
// all read from the same endpoint.
router.post('/:orderId/packaging/evidence', requireAuth, uploadPackagingImage.single('image'), multerErrorHandler, uploadPackagingEvidence);
router.get('/:orderId/packaging/evidence', requireAuth, listPackagingEvidence);
router.post('/:orderId/packaging/evidence/:evidenceId/supersede', requireAuth, supersedePackagingEvidence);
router.post('/:orderId/packaging/handed-to-logistics', requireAuth, markHandedToLogistics);
router.get('/:orderId/packaging/requirements', requireAuth, getPackagingRequirements);

router.get('/mine/buyer', requireAuth, myOrdersAsBuyer);
router.get('/mine/seller', requireAuth, myOrdersAsSeller);
router.get('/mine/delivery', requireAuth, myOrdersAsDelivery);
router.get('/all', requireAuth, requireAdmin, requirePermission('orders'), allOrders);
router.post('/cart-checkout', requireAuth, checkoutCart);
router.post('/cart-checkout/:checkoutGroupId/confirm', requireAuth, paymentsGate, confirmCartPayment);
router.post('/:orderId/cancel', requireAuth, cancelOrder);
router.post('/:orderId/reorder', requireAuth, reorder);
router.get('/:orderId/receipt', requireAuth, getReceipt);
router.post('/:orderId/contact-seller', requireAuth, contactSellerAboutOrder);
router.post(
 "/cart-checkout/:checkoutGroupId/submit-payment",
requireAuth,
 paymentsGate,
 uploadProof.single('proof'),
 multerErrorHandler,
 submitManualPayment
);

export default router;
