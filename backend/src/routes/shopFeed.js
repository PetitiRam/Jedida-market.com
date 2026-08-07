import express from 'express';
import {
  createPost, updatePost, deletePost, listMyPosts,
  getShopFeed, getDiscoveryFeed, getPersonalizedFeed,
  likePost, unlikePost, savePost, unsavePost, listSavedPosts, recordShare,
  addComment, listComments, deleteComment
} from '../controllers/shopFeedController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Seller — manage own shop's posts (verified-shop check happens in the controller).
router.post('/posts', requireAuth, createPost);
router.patch('/posts/:postId', requireAuth, updatePost);
router.delete('/posts/:postId', requireAuth, deletePost);
router.get('/posts/mine', requireAuth, listMyPosts);

// Public.
router.get('/discovery', optionalAuth, getDiscoveryFeed);
router.get('/shop/:shopId', optionalAuth, getShopFeed);

// Buyer.
router.get('/for-you', requireAuth, getPersonalizedFeed);
router.get('/saved', requireAuth, listSavedPosts);
router.post('/posts/:postId/like', requireAuth, likePost);
router.delete('/posts/:postId/like', requireAuth, unlikePost);
router.post('/posts/:postId/save', requireAuth, savePost);
router.delete('/posts/:postId/save', requireAuth, unsavePost);
router.post('/posts/:postId/share', optionalAuth, recordShare);
router.post('/posts/:postId/comments', requireAuth, addComment);
router.get('/posts/:postId/comments', listComments);
router.delete('/comments/:commentId', requireAuth, deleteComment);

export default router;
