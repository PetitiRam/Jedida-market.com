import express from 'express';
import { listPublicAds, trackAdClick } from '../controllers/adminController.js';

const router = express.Router();
router.get('/', listPublicAds); // ?placement=hero|deals|sidebar|category|header_strip
router.post('/:id/click', trackAdClick);
export default router;
