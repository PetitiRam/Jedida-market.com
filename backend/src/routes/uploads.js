import express from 'express';
import multer from 'multer';
import { uploadMedia, myUploads } from '../controllers/uploadsController.js';
import { requireAuth } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = express.Router();

router.post('/', requireAuth, upload.single('file'), uploadMedia);
router.get('/mine', requireAuth, myUploads);

export default router;
