import express from 'express';
import multer from 'multer';
import {
  getMyProfile, updateMyProfile, getPublicProfile,
  uploadAvatar, uploadCoverImage,
  followUser, unfollowUser, getFollowers, getFollowing,
  blockProfileUser, unblockProfileUser, myBlockedUsers, reportProfileUser
} from '../controllers/profileController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { multerErrorHandler } from '../middleware/multerErrorHandler.js';

// Same in-memory multer config as uploads.js — file goes to Cloudinary,
// never touches local disk. Photos are much smaller than general media,
// so a tighter 15MB cap catches oversized files before they even reach
// validateUploadAny.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const router = express.Router();

// ----- Own profile -----
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.post('/me/avatar', requireAuth, upload.single('file'), multerErrorHandler, uploadAvatar);
router.post('/me/cover', requireAuth, upload.single('file'), multerErrorHandler, uploadCoverImage);

// ----- Block list (must come before the generic /:userId so the route
// matcher doesn't treat 'blocked' as a userId) -----
router.get('/me/blocked', requireAuth, myBlockedUsers);

// ----- Follow system -----
router.post('/:userId/follow', requireAuth, followUser);
router.delete('/:userId/follow', requireAuth, unfollowUser);
router.get('/:userId/followers', optionalAuth, getFollowers);
router.get('/:userId/following', optionalAuth, getFollowing);

// ----- Block / report -----
router.post('/:userId/block', requireAuth, blockProfileUser);
router.delete('/:userId/block', requireAuth, unblockProfileUser);
router.post('/:userId/report', requireAuth, reportProfileUser);

// ----- Public profile (keep last — it's the catch-all /:userId) -----
router.get('/:userId', optionalAuth, getPublicProfile);

export default router;
