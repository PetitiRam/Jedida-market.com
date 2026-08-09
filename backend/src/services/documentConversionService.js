// Local document -> PDF conversion using LibreOffice's headless CLI
// (`soffice --convert-to pdf`). Runs entirely inside this container — no
// external conversion API, no upload of the file anywhere else.
//
// Requires LibreOffice installed on the host (see backend/Dockerfile).
// Not available in local dev unless LibreOffice is installed there too —
// callers should treat a thrown error as "conversion unavailable" and
// degrade gracefully (e.g. let the user download the original instead).

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

const CONVERTIBLE_EXTENSIONS = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.rtf']);

export function isConvertible(originalName) {
  return CONVERTIBLE_EXTENSIONS.has(path.extname(originalName || '').toLowerCase());
}

/**
 * Converts an office document buffer to a PDF buffer.
 * @param {Buffer} buffer - the source file content
 * @param {string} originalName - original filename, used only for its extension
 * @returns {Promise<Buffer>} the converted PDF
 * @throws if LibreOffice isn't installed, the conversion times out, or the
 *   input isn't something soffice can open.
 */
export async function convertToPdf(buffer, originalName) {
  const soffice = process.env.SOFFICE_BIN || 'soffice';
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-convert-'));
  const ext = path.extname(originalName || '') || '.docx';
  const inputPath = path.join(workDir, `input${ext}`);

  try {
    await fs.writeFile(inputPath, buffer);

    // --headless: no GUI. --norestore: skip crash-recovery prompt.
    // -env:UserInstallation=file://<workDir>/.lo : gives this run its own
    // isolated LibreOffice profile dir instead of sharing the default
    // one — required so concurrent conversions (parallel requests) don't
    // collide/lock each other out.
    const profileDir = path.join(workDir, '.lo-profile');
    await execFileAsync(soffice, [
      '--headless',
      '--norestore',
      `-env:UserInstallation=file://${profileDir}`,
      '--convert-to', 'pdf',
      '--outdir', workDir,
      inputPath
    ], { timeout: 60000 });

    const outputPath = path.join(workDir, `input.pdf`);
    return await fs.readFile(outputPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('LibreOffice (soffice) is not installed on this server. Deploy via backend/Dockerfile to enable document conversion.');
    }
    throw new Error(`Document conversion failed: ${err.message}`);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
