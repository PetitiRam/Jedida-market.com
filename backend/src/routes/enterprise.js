import express from 'express';
import {
  listMyCollections, listShopCollections, createCollection, updateCollection, deleteCollection, setCollectionProducts,
  listShopReviews, createShopReview
} from '../controllers/enterpriseController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/collections/mine', requireAuth, listMyCollections);
router.post('/collections', requireAuth, createCollection);
router.patch('/collections/:id', requireAuth, updateCollection);
router.delete('/collections/:id', requireAuth, deleteCollection);
router.put('/collections/:id/products', requireAuth, setCollectionProducts);
router.get('/shops/:shopId/collections', optionalAuth, listShopCollections);

router.get('/shops/:shopId/reviews', optionalAuth, listShopReviews);
router.post('/shops/:shopId/reviews', requireAuth, createShopReview);

export default router;
