import express from 'express';
import multer from 'multer';
import { uploadMedia, myUploads } from '../controllers/uploadsController.js';
import { requireAuth } from '../middleware/auth.js';
import { multerErrorHandler } from '../middleware/multerErrorHandler.js';

// Multer configuration: store file in memory before passing to Cloudinary
// 50MB limit matches Cloudinary's default
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
  // No fileFilter here: multer only invokes fileFilter once it has a file
  // part to inspect, so it can never catch the "no file attached at all"
  // case — that's handled in uploadMedia() below (`if (!file) ...`), which
  // is the only place it can actually be detected.
});

const router = express.Router();

// POST /api/uploads — upload a media file
// Requires: Authorization header (Bearer token)
// Body: multipart/form-data with 'file' field
router.post('/', requireAuth, upload.single('file'), multerErrorHandler, uploadMedia);

// GET /api/uploads/mine — get user's own uploaded media
// Requires: Authorization header (Bearer token)
router.get('/mine', requireAuth, myUploads);

export default router;
