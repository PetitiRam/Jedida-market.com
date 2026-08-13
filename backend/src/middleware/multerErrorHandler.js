import multer from 'multer';

// Shared error-translation middleware for every multer-backed upload route
// (uploads.js, partners.js, partnerPortal.js, adminAiTraining.js).
//
// Without this, any error multer/busboy throws while parsing a multipart
// request — a file over the size limit, a missing/renamed field, or a
// malformed body (most commonly: the client set its own `Content-Type:
// multipart/form-data` header without a boundary, stripping the one the
// browser would otherwise generate) — falls through to server.js's
// catch-all error handler, which returns a generic
// `{ error: "Something went wrong on our end." }` with no way for the
// frontend to explain what actually happened.
//
// Mount this immediately after every `upload.single(...)` /
// `upload.array(...)` call:
//
//   router.post('/', requireAuth, upload.single('file'), multerErrorHandler, controllerFn);
//
// Express only invokes a 4-arg middleware when the one before it calls
// next(err), so this is a no-op on a successful parse.
export function multerErrorHandler(err, req, res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'File is too large.',
      LIMIT_FILE_COUNT: 'Too many files in this upload.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field. Please try uploading again.',
      LIMIT_PART_COUNT: 'This upload has too many parts.',
      LIMIT_FIELD_KEY: 'A form field name was too long.',
      LIMIT_FIELD_VALUE: 'A form field value was too long.',
      LIMIT_FIELD_COUNT: 'This upload has too many form fields.',
    };
    return res.status(400).json({
      error: messages[err.code] || 'Could not process the uploaded file. Please try again.',
    });
  }

  // Busboy throws a plain Error (not a MulterError) when the multipart
  // body itself is malformed — most commonly a missing `boundary=` on the
  // Content-Type header, which happens if a caller manually sets
  // `Content-Type: multipart/form-data` on a FormData request instead of
  // leaving it to the browser to generate. Surface this as a clear,
  // actionable message instead of a generic server error.
  if (/boundary/i.test(err.message || '') || /multipart/i.test(err.message || '')) {
    console.error('Multipart parse error (likely a manually-set Content-Type header without a boundary):', err.message);
    return res.status(400).json({
      error: 'Your upload could not be read. Please try again — if this keeps happening, try a different network or browser.',
    });
  }

  return next(err);
}

export default multerErrorHandler;
