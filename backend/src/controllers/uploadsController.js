import { query } from '../config/db.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUploadAny } from '../services/uploadSecurity.js';
import { recordSecurityEvent } from '../services/securityEventService.js';

/**
 * Upload media file (image, video, audio, or document).
 * POST /api/uploads
 * 
 * Requires: Authorization header (Bearer token)
 * Body: multipart/form-data with 'file' field
 * 
 * Security:
 * - Validates MIME type, magic bytes, file size, and threat scan
 * - Stores only in Cloudinary (not local filesystem)
 * - Records all uploads (success and rejection) to audit log
 * - Enforces per-user upload quotas where applicable
 */
export async function uploadMedia(req, res) {
  // Cloudinary must be configured for uploads to work
  if (!isCloudinaryConfigured()) {
    return res.status(501).json({
      error: 'Media upload is not configured on this server yet. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, or continue pasting image/video URLs directly.'
    });
  }

  const file = req.file;
  const userId = req.user.id;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // No file provided
  if (!file) {
    recordSecurityEvent({
      eventType: 'upload_rejected',
      severity: 1,
      userId,
      ipAddress,
      summary: 'Upload attempt with no file attached.',
      metadata: { reason: 'no_file' }
    });
    return res.status(400).json({ error: 'No file was uploaded.' });
  }

  // File size check (Multer limit acts as first pass, but we validate again here)
  if (file.size > 50 * 1024 * 1024) {
    recordSecurityEvent({
      eventType: 'upload_rejected',
      severity: 2,
      userId,
      ipAddress,
      summary: `Upload rejected: file too large (${file.size} bytes).`,
      metadata: { originalName: file.originalname, size: file.size }
    });
    return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
  }

  // Validate against allowed categories: image, video, audio, document
  const check = await validateUploadAny(
    file,
    ['image', 'video', 'audio', 'document'],
    { userId, ipAddress }
  );

  if (!check.ok) {
    if (check.internalReason) {
      console.warn(`Upload security rejection for user ${userId}:`, check.internalReason);
    }
    // Return user-friendly error, log the internal reason
    return res.status(400).json({ error: check.error });
  }

  // Determine media type and Cloudinary resource type
  const isVideo = file.mimetype.startsWith('video/');
  const isAudio = file.mimetype.startsWith('audio/');
  const isDocument = !isVideo && !isAudio && !file.mimetype.startsWith('image/');

  const resourceType = isVideo || isAudio ? 'video' : isDocument ? 'raw' : 'image';
  const mediaType = isVideo ? 'video' : isAudio ? 'audio' : isDocument ? 'document' : 'image';

  try {
    // Upload to Cloudinary
    const result = await uploadToCloudinary(file.buffer, file.originalname, resourceType);

    // Insert metadata into PostgreSQL
    const dbResult = await query(
      `INSERT INTO media_uploads (
        uploaded_by, media_type, url, thumbnail_url, provider, 
        original_name, bytes, width, height, duration_seconds, cloudinary_public_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, uploaded_by, media_type, url, thumbnail_url, original_name, 
                bytes, width, height, duration_seconds, created_at`,
      [
        userId,
        mediaType,
        result.url,
        result.thumbnailUrl,
        'cloudinary',
        file.originalname,
        result.bytes || file.size,
        result.width || null,
        result.height || null,
        result.durationSeconds || null,
        result.publicId
      ]
    );

    if (!dbResult.rows.length) {
      throw new Error('Database insert returned no rows');
    }

    const media = dbResult.rows[0];

    // Log successful upload
    recordSecurityEvent({
      eventType: 'upload_success',
      severity: 0,
      userId,
      ipAddress,
      summary: `Media uploaded: ${mediaType} (${Math.round(file.size / 1024)}KB)`,
      metadata: {
        mediaId: media.id,
        mediaType,
        originalName: file.originalname,
        size: file.size,
        cloudinaryPublicId: result.publicId
      }
    });

    return res.status(201).json({
      message: 'Upload successful.',
      media: {
        id: media.id,
        mediaType: media.media_type,
        url: media.url,
        thumbnailUrl: media.thumbnail_url,
        originalName: media.original_name,
        bytes: media.bytes,
        width: media.width,
        height: media.height,
        durationSeconds: media.duration_seconds,
        createdAt: media.created_at
      }
    });
  } catch (err) {
    console.error('Upload error:', err.message);

    // Distinguish Cloudinary errors from database errors
    if (err.message?.includes('Cloudinary')) {
      recordSecurityEvent({
        eventType: 'upload_failed',
        severity: 3,
        userId,
        ipAddress,
        summary: `Cloudinary upload failed: ${err.message}`,
        metadata: { originalName: file.originalname, error: err.message }
      });
      return res.status(502).json({
        error: 'Could not upload file to storage. Please try again shortly.'
      });
    }

    // Database error
    if (err.code === '23505') {
      // Duplicate key (shouldn't happen, but guard against it)
      recordSecurityEvent({
        eventType: 'upload_failed',
        severity: 2,
        userId,
        ipAddress,
        summary: 'Upload rejected: duplicate Cloudinary public ID',
        metadata: { originalName: file.originalname }
      });
      return res.status(409).json({
        error: 'This file appears to have already been uploaded. Please try a different file.'
      });
    }

    if (err.code === '23503') {
      // Foreign key violation (user doesn't exist)
      recordSecurityEvent({
        eventType: 'upload_failed',
        severity: 4,
        userId,
        ipAddress,
        summary: 'Upload failed: user not found in database',
        metadata: { originalName: file.originalname }
      });
      return res.status(401).json({
        error: 'Your user account was not found. Please sign in again.'
      });
    }

    recordSecurityEvent({
      eventType: 'upload_failed',
      severity: 3,
      userId,
      ipAddress,
      summary: `Database error during upload: ${err.code || 'UNKNOWN'}`,
      metadata: { originalName: file.originalname, error: err.message }
    });

    return res.status(500).json({
      error: 'An error occurred while saving your upload. Please try again.'
    });
  }
}

/**
 * Get user's own uploaded media
 * GET /api/uploads/mine
 * 
 * Returns the last 100 uploads for the authenticated user, newest first.
 */
export async function myUploads(req, res) {
  try {
    const userId = req.user.id;
    const result = await query(
      `SELECT id, media_type, url, thumbnail_url, original_name, bytes, 
              width, height, duration_seconds, created_at
       FROM media_uploads
       WHERE uploaded_by = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.json({
      uploads: result.rows.map(row => ({
        id: row.id,
        mediaType: row.media_type,
        url: row.url,
        thumbnailUrl: row.thumbnail_url,
        originalName: row.original_name,
        bytes: row.bytes,
        width: row.width,
        height: row.height,
        durationSeconds: row.duration_seconds,
        createdAt: row.created_at
      }))
    });
  } catch (err) {
    console.error('Error fetching uploads:', err);
    return res.status(500).json({
      error: 'Could not retrieve your uploads. Please try again.'
    });
  }
}
