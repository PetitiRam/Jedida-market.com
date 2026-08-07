import express from 'express';
import { getMyProfile, updateMyProfile, getPublicProfile } from '../controllers/profileController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.get('/:userId', optionalAuth, getPublicProfile);

export default router;
