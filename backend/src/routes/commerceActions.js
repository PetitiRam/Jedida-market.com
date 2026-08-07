import express from 'express';
import * as ctrl from '../controllers/commerceActionsController.js';
import { requireAuth, requireAdmin, optionalAuth, requirePermission } from '../middleware/auth.js';
                                  
const router = express.Router();

router.post('/wishlist/:productId/toggle', requireAuth, ctrl.toggleWishlist);
router.get('/wishlist/:productId/status', requireAuth, ctrl.getWishlistStatus);
router.get('/wishlist/mine', requireAuth, ctrl.listMyWishlist);

router.post('/shops/:shopId/follow/toggle', requireAuth, ctrl.toggleFollow);
router.get('/shops/:shopId/follow/info', optionalAuth, ctrl.getShopFollowInfo);

router.post('/cart', requireAuth, ctrl.addToCart);
router.get('/cart', requireAuth, ctrl.getCart);
router.patch('/cart/:itemId', requireAuth, ctrl.updateCartItem);
router.delete('/cart/:itemId', requireAuth, ctrl.removeCartItem);

router.post('/products/:productId/quote', requireAuth, ctrl.requestQuote);
router.get('/quotes/mine', requireAuth, ctrl.getMyQuoteRequests);

router.get('/admin/quotes/pending', requireAuth, requireAdmin, requirePermission('products'), ctrl.listPendingQuotes);
router.patch('/admin/quotes/:quoteId', requireAuth, requireAdmin, requirePermission('products'), ctrl.respondToQuote);

export default router;
