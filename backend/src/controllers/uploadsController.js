import { query } from '../config/db.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUploadAny } from '../services/uploadSecurity.js';

export async function uploadMedia(req, res) {
  if (!isCloudinaryConfigured()) {
    return res.status(501).json({
      error: 'Media upload is not configured on this server yet. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, or continue pasting image/video URLs directly.'
    });
  }

  const file = req.file;
  const check = await validateUploadAny(file, ['image', 'video', 'audio', 'document']);
  if (!check.ok) {
    if (check.internalReason) console.warn('Upload blocked by security scan:', check.internalReason, '| user:', req.user.id);
    return res.status(400).json({ error: check.error });
  }

  const isVideo = file.mimetype.startsWith('video/');
  const isAudio = file.mimetype.startsWith('audio/');
  const isDocument = !isVideo && !isAudio && !file.mimetype.startsWith('image/');

  try {
    // Cloudinary treats audio as a 'video' resource type internally; raw
    // documents (pdf/doc/xls) upload as 'raw' so they're stored, not
    // transcoded.
    const resourceType = isVideo || isAudio ? 'video' : isDocument ? 'raw' : 'image';
    const mediaType = isVideo ? 'video' : isAudio ? 'audio' : isDocument ? 'document' : 'image';
    const result = await uploadToCloudinary(file.buffer, file.originalname, resourceType);

    const dbResult = await query(
      `INSERT INTO media_uploads (uploaded_by, media_type, url, thumbnail_url, provider, bytes, width, height, duration_seconds, original_name)
       VALUES ($1,$2,$3,$4,'cloudinary',$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, mediaType, result.url, result.thumbnailUrl, result.bytes, result.width, result.height, result.durationSeconds, file.originalname]
    );

    return res.status(201).json({ message: 'Upload successful.', media: dbResult.rows[0] });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(502).json({ error: 'Could not upload file. Please try again.' });
  }
}

export async function myUploads(req, res) {
  const result = await query('SELECT * FROM media_uploads WHERE uploaded_by = $1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json({ uploads: result.rows });
}
