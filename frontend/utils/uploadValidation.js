// Mirrors backend/src/services/uploadSecurity.js FILE_CATEGORIES. Kept in
// sync manually (no shared package between frontend/backend here) — if you
// change one, change the other. This is a client-side pre-check only; the
// server is still the source of truth and re-validates everything
// (including magic bytes) regardless of what the client reports.
//
// The point of checking here at all: without it, picking a 70MB video or
// a .mkv file meant watching a multi-minute upload crawl along only to be
// rejected by the server at the very end. Catching it before the upload
// even starts turns that into an instant, specific message.
export const UPLOAD_LIMITS = {
  image: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxBytes: 8 * 1024 * 1024, label: 'JPG, PNG, WEBP, or GIF' },
  video: { mimes: ['video/mp4', 'video/quicktime', 'video/webm'], maxBytes: 50 * 1024 * 1024, label: 'MP4, MOV, or WEBM' },
  audio: { mimes: ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/x-m4a', 'audio/aac', 'audio/3gpp'], maxBytes: 15 * 1024 * 1024, label: 'MP3, M4A, WAV, OGG, or WEBM audio' },
  document: {
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    maxBytes: 20 * 1024 * 1024,
    label: 'PDF, DOC, DOCX, XLS, or XLSX'
  }
};

function baseMimeType(mimetype) {
  // Same normalization as the backend: strip codec parameters
  // ("audio/webm;codecs=opus" -> "audio/webm") before comparing.
  return String(mimetype || '').split(';')[0].trim().toLowerCase();
}

function categoryFor(mimetype) {
  const base = baseMimeType(mimetype);
  return Object.entries(UPLOAD_LIMITS).find(([, def]) => def.mimes.includes(base))?.[0] || null;
}

function formatMB(bytes) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

// Validates a single File/Blob against one or more allowed categories.
// Returns { ok: true, category } or { ok: false, error }.
export function validateFileForUpload(file, allowedCategories = ['image', 'video', 'audio', 'document']) {
  if (!file) return { ok: false, error: 'No file selected.' };

  const category = categoryFor(file.type);
  if (!category || !allowedCategories.includes(category)) {
    const allowedLabels = allowedCategories.map((c) => UPLOAD_LIMITS[c]?.label).filter(Boolean).join(', ');
    return { ok: false, error: `Unsupported file type. Please use: ${allowedLabels}.` };
  }

  const def = UPLOAD_LIMITS[category];
  if (file.size > def.maxBytes) {
    return { ok: false, error: `${category === 'video' ? 'Video' : category === 'audio' ? 'Audio file' : 'File'} is too large. Maximum size is ${formatMB(def.maxBytes)} (yours is ${formatMB(file.size)}).` };
  }
  if (file.size === 0) {
    return { ok: false, error: 'This file appears to be empty.' };
  }

  return { ok: true, category };
}
