import express from 'express';
import { getHomeFeed } from '../controllers/homeController.js';

const router = express.Router();
router.get('/', getHomeFeed);
export default router;
