import express from 'express';
import multer from 'multer';
import { uploadMedia, myUploads } from '../controllers/uploadsController.js';
import { requireAuth } from '../middleware/auth.js';

// Multer configuration: store file in memory before passing to Cloudinary
// 50MB limit matches Cloudinary's default
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  // Reject files with missing or wrong field name at the multer layer
  fileFilter: (req, file, cb) => {
    if (!file) {
      return cb(new Error('No file provided in upload request.'));
    }
    cb(null, true);
  }
});

const router = express.Router();

// POST /api/uploads — upload a media file
// Requires: Authorization header (Bearer token)
// Body: multipart/form-data with 'file' field
router.post('/', requireAuth, upload.single('file'), uploadMedia);

// GET /api/uploads/mine — get user's own uploaded media
// Requires: Authorization header (Bearer token)
router.get('/mine', requireAuth, myUploads);

export default router;
