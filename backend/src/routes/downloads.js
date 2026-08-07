// Add to backend/src/routes/downloads.js, then wire into server.js
// (see server.additions.js in this same folder).
//
// Serves the real installer files placed in backend/public/downloads/ by the
// CI build pipeline (see /ci/.github/workflows/build-shell.yml). Every file
// is sent with Content-Disposition: attachment, so the browser/device always
// treats the tap as a download — straight into the OS Downloads folder /
// device icon tray — never opens it inline.

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'downloads');

const router = express.Router();

// filename -> real MIME type. Wrong/missing MIME types are the #1 reason a
// tap opens a preview instead of downloading on mobile browsers.
const MIME_TYPES = {
  '.apk': 'application/vnd.android.package-archive',
  '.exe': 'application/x-msdownload',
  '.dmg': 'application/x-apple-diskimage',
  '.appimage': 'application/x-executable',
  '.deb': 'application/vnd.debian.binary-package'
};

const ALLOWED_FILES = new Set([
  'jedida-marketplace.apk',
  'JEDIDA-Marketplace-Setup.exe',
  'JEDIDA-Marketplace.dmg',
  'JEDIDA-Marketplace.AppImage',
  'JEDIDA-Marketplace.deb'
]);

// GET /downloads/:file — the actual download endpoint the frontend's
// <a href download> buttons point at.
router.get('/:file', (req, res) => {
  const filename = req.params.file;

  // Never let this become an arbitrary-file-read endpoint.
  if (!ALLOWED_FILES.has(filename)) {
    return res.status(404).json({ error: 'Not found' });
  }

  const filePath = path.join(DOWNLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'This build has not been published yet' });
  }

  const ext = path.extname(filename).toLowerCase();
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache'); // always re-check for the newest CI-built version

  fs.createReadStream(filePath).pipe(res);
});

// GET /api/downloads/manifest — lets the download page show real, current
// version numbers and file sizes instead of hardcoded values that go stale.
router.get('/manifest/current', (_req, res) => {
  const manifest = {};
  for (const filename of ALLOWED_FILES) {
    const filePath = path.join(DOWNLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      manifest[filename] = {
        available: true,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString()
      };
    } else {
      manifest[filename] = { available: false };
    }
  }
  res.json(manifest);
});

export default router;
