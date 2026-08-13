// Shared file-upload security layer used by every multer-backed upload
// endpoint (uploads.js, partners.js, partnerPortal.js, adminAiTraining.js).
// Closes the gap those four previously had independently: each trusted
// `file.mimetype`, which multer takes straight from the client-supplied
// Content-Type header of the multipart part — an attacker can label a
// renamed executable "image/jpeg" and every prior check would pass it
// straight through to storage.
//
// Two layers, both mandatory (fail closed on any of them):
//   1. MIME allowlist   — same category-based lists each controller had.
//   2. Magic-byte check — the file's actual leading bytes must match what
//      the claimed type looks like. Defeats simple relabeling.
// Plus a heuristic threat scan (executable signatures / embedded script
// markers) that always runs in-process — no external AV engine, daemon,
// or binary required, so this module has zero runtime dependency on the
// container it's deployed in. (An earlier version shelled out to a local
// ClamAV `clamscan` binary; that's been removed — see git history if you
// need to reintroduce a real AV engine behind an HTTP API instead.)

import crypto from 'crypto';
import path from 'path';

// ---------------------------------------------------------------------
// 1. Category definitions — MIME allowlist + size cap in one place, so
//    every endpoint that accepts "an image" or "a document" agrees on
//    what that means instead of drifting per-controller.
// ---------------------------------------------------------------------
export const FILE_CATEGORIES = {
  image: {
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxBytes: 8 * 1024 * 1024
  },
  video: {
    mimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxBytes: 50 * 1024 * 1024
  },
  audio: {
    mimes: ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/x-m4a', 'audio/aac', 'audio/3gpp'],
    maxBytes: 15 * 1024 * 1024
  },
  document: {
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    maxBytes: 20 * 1024 * 1024
  }
};

function categoryOf(mimetype) {
  const base = normalizeMimeType(mimetype);
  for (const [name, def] of Object.entries(FILE_CATEGORIES)) {
    if (def.mimes.includes(base)) return name;
  }
  return null;
}

// Browsers/recorders don't always send a bare MIME type. A file picked
// from a phone's voice-memo app, or (if a live recorder is ever added)
// a MediaRecorder Blob, commonly reports something like
// "audio/webm;codecs=opus" or "video/mp4; codecs=avc1" — same format,
// extra codec parameters. Comparing that raw string against our
// allowlist ('audio/webm', 'video/mp4', ...) always fails, which used to
// mean a perfectly valid audio/video file could be rejected purely
// because of a codecs suffix. Every place that reads file.mimetype in
// this module goes through this first.
function normalizeMimeType(mimetype) {
  return String(mimetype || '').split(';')[0].trim().toLowerCase();
}

// ---------------------------------------------------------------------
// 2. Magic-byte verification — checked against the actual buffer, never
//    the client-supplied mimetype string.
// ---------------------------------------------------------------------
function matchesSignature(buffer, mimetype) {
  const b = buffer;
  const hex = (n) => b.subarray(0, n).toString('hex');
  switch (normalizeMimeType(mimetype)) {
    case 'image/jpeg': return hex(3) === 'ffd8ff';
    case 'image/png': return hex(8) === '89504e470d0a1a0a';
    case 'image/gif': return b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a';
    case 'image/webp': return b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'video/mp4': return b.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'video/quicktime': return b.subarray(4, 8).toString('ascii') === 'ftyp' || b.subarray(4, 8).toString('ascii') === 'moov' || b.subarray(4, 8).toString('ascii') === 'free';
    case 'video/webm': return hex(4) === '1a45dfa3';
    case 'audio/mpeg': return hex(3) === '494433' /* ID3 */ || hex(2) === 'fffb' || hex(2) === 'fff3' || hex(2) === 'fff2';
    case 'audio/wav':
    case 'audio/x-wav': return b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE';
    case 'audio/ogg': return b.subarray(0, 4).toString('ascii') === 'OggS';
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/3gpp': return b.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'audio/webm': return hex(4) === '1a45dfa3';
    // AAC "ADTS" stream — starts with a 12-bit sync word (0xFFF).
    case 'audio/aac': return hex(2) === 'fff1' || hex(2) === 'fff9';
    case 'application/pdf': return b.subarray(0, 4).toString('ascii') === '%PDF';
    // Legacy .doc/.xls (OLE compound file) share one signature.
    case 'application/msword':
    case 'application/vnd.ms-excel': return hex(8) === 'd0cf11e0a1b11ae1';
    // .docx/.xlsx are ZIP containers — PK\x03\x04 (or the empty-archive
    // variant PK\x05\x06) is the real test; we can't cheaply tell a
    // Word doc from an Excel sheet from bytes alone, so any valid ZIP
    // signature passes for these two and the container's actual
    // structure is trusted to Office/Sheets to reject if malformed.
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return hex(4) === '504b0304' || hex(4) === '504b0506';
    default: return false;
  }
}

// ---------------------------------------------------------------------
// 3. Threat scan — heuristic byte-signature checks always run (catch
//    the common "polyglot" tricks: an executable or script smuggled
//    inside a file that otherwise passes the magic-byte check above).
// ---------------------------------------------------------------------
const EXECUTABLE_SIGNATURES = [
  { name: 'Windows executable (MZ/PE)', bytes: Buffer.from('4d5a', 'hex') },       // MZ header
  { name: 'ELF executable', bytes: Buffer.from('7f454c46', 'hex') },              // \x7fELF
  { name: 'Mach-O executable', bytes: Buffer.from('cafebabe', 'hex') }
];
const SCRIPT_MARKERS = ['<script', '<?php', '<%eval', 'javascript:', 'onerror=', 'onload='];

function heuristicScan(buffer, mimetype) {
  // An executable signature has no business appearing at the start of
  // any file type this platform accepts.
  for (const sig of EXECUTABLE_SIGNATURES) {
    if (buffer.subarray(0, sig.bytes.length).equals(sig.bytes)) {
      return { clean: false, reason: `File begins with an executable signature (${sig.name}).` };
    }
  }
  // Script-injection markers embedded in something claiming to be an
  // image/video/audio file — legitimate media files don't contain these
  // as plain text near the start of the file. (PDFs/Office docs can
  // legitimately contain some of these substrings in metadata, so this
  // check is scoped to non-document categories only.)
  const category = categoryOf(mimetype);
  if (category && category !== 'document') {
    const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1').toLowerCase();
    for (const marker of SCRIPT_MARKERS) {
      if (head.includes(marker)) {
        return { clean: false, reason: 'File contains embedded script content.' };
      }
    }
  }
  return { clean: true };
}

async function scanForThreats(buffer, mimetype) {
  return heuristicScan(buffer, mimetype);
}

// ---------------------------------------------------------------------
// Random storage filename — defense in depth on top of Cloudinary's own
// randomized public_id, and keeps the original filename (which a user
// fully controls) out of any storage key, log line, or URL path.
// ---------------------------------------------------------------------
export function randomStorageName(originalName) {
  const ext = String(originalName || '').match(/\.[a-zA-Z0-9]+$/)?.[0] || '';
  return `${crypto.randomBytes(16).toString('hex')}${ext}`;
}

import { recordSecurityEvent } from './securityEventService.js';

// ---------------------------------------------------------------------
// The one function every controller should call. `context` is optional
// (ipAddress/userId) so every existing call site keeps working unchanged;
// callers that pass it get their rejection logged to the Security
// Operations Dashboard's live feed.
// ---------------------------------------------------------------------
export async function validateUpload(file, category, context = {}) {
  const def = FILE_CATEGORIES[category];
  if (!def) return { ok: false, error: 'Unsupported upload category.' };
  if (!file) return { ok: false, error: 'No file was uploaded.' };

  const mimetype = normalizeMimeType(file.mimetype);

  if (!def.mimes.includes(mimetype)) {
    recordSecurityEvent({
      eventType: 'mime_rejected', severity: 2, ipAddress: context.ipAddress, userId: context.userId,
      summary: `Upload rejected: declared MIME type "${file.mimetype}" not allowed for category "${category}".`,
      metadata: { originalName: file.originalname, category },
    });
    return { ok: false, error: 'Unsupported file type.' };
  }
  if (file.size > def.maxBytes) {
    return { ok: false, error: `File too large. Max size is ${Math.round(def.maxBytes / (1024 * 1024))}MB.` };
  }
  if (!matchesSignature(file.buffer, mimetype)) {
    recordSecurityEvent({
      eventType: 'mime_rejected', severity: 3, ipAddress: context.ipAddress, userId: context.userId,
      summary: `Upload rejected: file content doesn't match its declared type "${file.mimetype}" (possible spoofed extension).`,
      metadata: { originalName: file.originalname, category },
    });
    return { ok: false, error: 'This file does not appear to be a valid file of the type it claims to be.' };
  }
  const scan = await scanForThreats(file.buffer, mimetype);
  if (!scan.clean) {
    recordSecurityEvent({
      eventType: 'malware_detected', severity: 5, ipAddress: context.ipAddress, userId: context.userId,
      summary: `Malware/threat scan blocked an upload: ${scan.reason || 'flagged content'}.`,
      metadata: { originalName: file.originalname, category, reason: scan.reason },
    });
    return { ok: false, error: 'This file failed a security scan and cannot be uploaded.', internalReason: scan.reason };
  }
  return { ok: true };
}

// Multi-category variant for endpoints that accept more than one kind of
// file in the same field (e.g. image OR document) — tries each allowed
// category and validates against whichever one actually matches the
// declared MIME type.
export async function validateUploadAny(file, categories, context = {}) {
  if (!file) return { ok: false, error: 'No file was uploaded.' };
  const mimetype = normalizeMimeType(file.mimetype);
  const matchedCategory = categories.find((c) => FILE_CATEGORIES[c]?.mimes.includes(mimetype));
  if (!matchedCategory) {
    recordSecurityEvent({
      eventType: 'mime_rejected', severity: 2, ipAddress: context.ipAddress, userId: context.userId,
      summary: `Upload rejected: "${file.mimetype}" didn't match any allowed category.`,
      metadata: { originalName: file.originalname, categories },
    });
    return { ok: false, error: 'Unsupported file type.' };
  }
  return validateUpload(file, matchedCategory, context);
}
