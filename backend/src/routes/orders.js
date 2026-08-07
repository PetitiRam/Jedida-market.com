import express from 'express';
import {
  createOrder, confirmPayment, confirmDelivery, releaseFunds, autoReleaseExpiredEscrow,
  myOrdersAsBuyer, myOrdersAsSeller, myOrdersAsDelivery, allOrders,cancelOrder,reorder,getReceipt,contactSellerAboutOrder,submitManualPayment, assignDelivery, adminRefundOrder
} from '../controllers/ordersController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import { checkoutCart, confirmCartPayment } from '../controllers/ordersController.js';
import { paymentsGate } from '../middleware/platformLockdown.js';
import { requireFaceVerification } from '../middleware/faceVerification.js';

const router = express.Router();

router.post('/', requireAuth, createOrder);
router.post('/:orderId/confirm-payment', requireAuth, paymentsGate, confirmPayment);
router.post('/:orderId/confirm-delivery', requireAuth, confirmDelivery);
router.post('/:orderId/release-funds', requireAuth, requireAdmin, requirePermission('orders'), releaseFunds);
router.post('/escrow/auto-release', requireAuth, requireAdmin, requirePermission('orders'), autoReleaseExpiredEscrow);
router.post('/:orderId/assign-delivery', requireAuth, requireAdmin, requirePermission('orders'), assignDelivery);
router.post('/:orderId/admin-refund', requireAuth, requireAdmin, requirePermission('orders'), requireFaceVerification('admin_refund'), adminRefundOrder);

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
 submitManualPayment
);

export default router;
