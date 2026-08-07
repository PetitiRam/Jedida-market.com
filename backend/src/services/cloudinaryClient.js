// Real media upload via Cloudinary's unsigned/signed upload API (no SDK
// dependency — plain HTTPS multipart request keeps this consistent with
// the other service clients in this folder). Configure CLOUDINARY_CLOUD_NAME
// + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET to enable; without them the
// upload route returns a clear 501 instead of silently failing.

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
 * @param {Buffer} fileBuffer
 * @param {string} filename
 * @param {'image'|'video'|'raw'} resourceType 'raw' covers non-media files
 *   (PDF, DOC/DOCX, etc.) — used by document-upload flows like Partner
 *   applications. Existing image/video callers are unaffected.
 * @param {string} [folder] optional Cloudinary subfolder override
 * @param {object} [opts]
 * @param {boolean} [opts.sensitive] Store as Cloudinary's private
 *   'authenticated' delivery type instead of the public default — the
 *   returned `url` is then a time-limited signed URL (see
 *   signedDeliveryUrl below) rather than a permanently-public one. Use
 *   for KYC/partner/business documents; leave false for anything meant
 *   to be publicly viewable (product photos, shop logos, chat media).
 */
export async function uploadToCloudinary(fileBuffer, filename, resourceType = 'image', folder = 'jedida-marketplace', opts = {}) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured on this server.');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const timestamp = Math.floor(Date.now() / 1000);
  // Storage key is always a random name we generate — never the
  // user-supplied original filename — so nothing about how a file was
  // named locally ends up in a public URL, a log line, or another
  // user's view of shared content. 'raw' (document) delivery needs the
  // extension kept in the public_id for Cloudinary to serve the right
  // format; image/video derive format automatically, so drop it there
  // to avoid a cosmetic double-extension in the resulting URL.
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

  return {
    url,
    publicId: data.public_id,
    resourceType,
    thumbnailUrl: resourceType === 'video' && !opts.sensitive ? data.secure_url.replace(/\.\w+$/, '.jpg') : url,
    bytes: data.bytes,
    width: data.width,
    height: data.height,
    durationSeconds: data.duration ? Math.round(data.duration) : null
  };
}

// Signed, time-limited delivery URL for a private ('authenticated')
// asset. Used both right after upload (uploadToCloudinary above) and any
// time a private document needs to be re-shared later (e.g. an admin
// reviewing a KYC/partner document) without ever making the asset
// permanently public.
export function signedDeliveryUrl(publicId, resourceType = 'image', expiresInSeconds = 3600) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const toSign = `expires_at=${expiresAt}public_id=${publicId}type=authenticated${process.env.CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha256').update(toSign).digest('hex').slice(0, 32);
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/authenticated/s--${signature}--/e_${expiresAt}/${publicId}`;
}
