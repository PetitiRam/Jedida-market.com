import crypto from 'crypto';
import { randomStorageName } from './uploadSecurity.js';

export function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

function signParams(params) {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(sorted + process.env.CLOUDINARY_API_SECRET).digest('hex');
}

/**
 * Upload file to Cloudinary with signed authentication
 * @param {Buffer} fileBuffer - File contents
 * @param {string} filename - Original filename (used for extension only, name is randomized)
 * @param {'image'|'video'|'raw'} resourceType - Resource type for Cloudinary
 * @param {string} [folder] - Cloudinary folder path (default: 'jedida-marketplace')
 * @param {object} [opts] - Additional options
 * @param {boolean} [opts.sensitive] - Store as authenticated delivery (time-limited URLs)
 * @param {boolean} [opts.audioOnly] - True when this is an audio file uploaded under
 *   Cloudinary's 'video' resource type (audio has no video resource type of its own).
 *   Skips generating a fake video-frame thumbnail for it — see note below.
 * @returns {Promise<{url, publicId, resourceType, thumbnailUrl, bytes, width, height, durationSeconds}>}
 */
export async function uploadToCloudinary(fileBuffer, filename, resourceType = 'image', folder = 'jedida-marketplace', opts = {}) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured on this server.');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Storage key is always a random name we generate — never the user-supplied
  // original filename — so nothing about how a file was named locally ends up
  // in a public URL, a log line, or another user's view of shared content.
  // 'raw' (document) delivery needs the extension kept in the public_id for
  // Cloudinary to serve the right format; image/video derive format
  // automatically, so drop it there to avoid a cosmetic double-extension.
  const randomName = randomStorageName(filename);
  const publicId = resourceType === 'raw' ? randomName : randomName.replace(/\.[a-zA-Z0-9]+$/, '');
  const type = opts.sensitive ? 'authenticated' : 'upload';
  
  const signParamsObj = { folder, public_id: publicId, timestamp, type };
  const signature = signParams(signParamsObj);

  const form = new FormData();
  form.append('file', new Blob([fileBuffer]));
  form.append('api_key', process.env.CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('public_id', publicId);
  form.append('type', type);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: form
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const url = opts.sensitive
    ? signedDeliveryUrl(data.public_id, resourceType)
    : data.secure_url;

  // Audio files are uploaded under Cloudinary's 'video' resource type
  // (audio has no resource type of its own), so `resourceType === 'video'`
  // alone can't tell an actual video apart from an audio-only file. That
  // used to mean every audio upload got a thumbnailUrl computed the same
  // way as a video's — replacing the extension with `.jpg` and asking
  // Cloudinary for a frame grab that doesn't exist for an audio-only
  // asset, producing a broken image link. opts.audioOnly (set by the
  // caller, which already knows the real MIME type) opts out of that.
  const isActualVideo = resourceType === 'video' && !opts.audioOnly;

  return {
    url,
    publicId: data.public_id,
    resourceType,
    thumbnailUrl: isActualVideo && !opts.sensitive ? data.secure_url.replace(/\.\w+$/, '.jpg') : url,
    bytes: data.bytes,
    width: data.width,
    height: data.height,
    durationSeconds: data.duration ? Math.round(data.duration) : null
  };
}

/**
 * Generate a signed, time-limited delivery URL for a private ('authenticated') asset
 * Used both right after upload and any time a private document needs to be
 * re-shared later (e.g. an admin reviewing a KYC/partner document) without
 * ever making the asset permanently public.
 * 
 * @param {string} publicId - Cloudinary public_id
 * @param {'image'|'video'|'raw'} resourceType - Resource type
 * @param {number} [expiresInSeconds] - URL lifetime in seconds (default: 3600 = 1 hour)
 * @returns {string} - Signed delivery URL with time-limited access
 */
export function signedDeliveryUrl(publicId, resourceType = 'image', expiresInSeconds = 3600) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const toSign = `expires_at=${expiresAt}public_id=${publicId}type=authenticated${process.env.CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha256').update(toSign).digest('hex').slice(0, 32);
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/authenticated/s--${signature}--/e_${expiresAt}/${publicId}`;
}
