// Real OCR using Tesseract.js (runs fully in-browser via WASM — no cloud
// OCR API, no per-document fee). Field extraction below is regex/heuristic
// pattern-matching over the recognized text, tuned for common ID layouts
// (Uganda/East Africa national ID as the primary reference, given the
// mockup). It will need tuning per document format you actually accept —
// OCR text from a real ID scan is noisy, and these patterns are a
// reasonable starting point, not a certified document-reading engine.
// It also does NOT detect forged/edited documents — that requires a
// separate document-authenticity model (hologram/microprint/font
// consistency checks), which is out of scope for client-side OCR.

import Tesseract from 'tesseract.js';

export async function runOcr(file, onProgress) {
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  return { text: data.text, confidence: data.confidence };
}

const DATE_PATTERN = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g;
const ID_NUMBER_PATTERN = /\b([A-Z]{0,3}\d{6,14}[A-Z0-9]{0,4})\b/g;

function findDates(text) {
  return [...text.matchAll(DATE_PATTERN)].map((m) => m[1]);
}

// Best-effort structured extraction. Returns null for anything it isn't
// confident enough to guess, and always includes rawText so the user can
// see exactly what OCR read and correct any field manually.
export function extractIdFields(text) {
  const upper = text.toUpperCase();
  const dates = findDates(text);

  const nameMatch = upper.match(/(?:SURNAME|NAME)S?[:\s]+([A-Z\s]{3,40})/);
  const genderMatch = upper.match(/\bSEX[:\s]*([MF])\b/) || upper.match(/\bGENDER[:\s]*([MF])\b/);
  const countryMatch = upper.match(/\b(UGANDA|KENYA|TANZANIA|RWANDA|NIGERIA|GHANA)\b/);
  const idNumbers = [...upper.matchAll(ID_NUMBER_PATTERN)].map((m) => m[1]);

  return {
    rawText: text,
    fullName: nameMatch ? nameMatch[1].trim() : null,
    gender: genderMatch ? genderMatch[1] : null,
    country: countryMatch ? countryMatch[1] : null,
    idNumberGuess: idNumbers[0] || null,
    idNumberCandidates: idNumbers,
    datesFound: dates,
    // Heuristic only: assumes the first date found is DOB and, if two
    // dates are present, the later one is expiry. Always show these to
    // the user as "detected — please confirm" rather than auto-locking.
    dateOfBirthGuess: dates[0] || null,
    expiryDateGuess: dates.length > 1 ? dates[dates.length - 1] : null,
  };
}

export function fieldsDisagree(ocrValue, formValue) {
  if (!ocrValue || !formValue) return false;
  const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return norm(ocrValue) !== norm(formValue);
}
