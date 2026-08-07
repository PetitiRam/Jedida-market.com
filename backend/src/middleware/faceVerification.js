import { verifyFace } from '../services/faceVerificationService.js';

// Usage: router.post('/withdraw', requireAuth, requireFaceVerification('withdrawal'), requestWithdrawal)
//
// Expects the client to send a live capture as `req.body.faceCapture`
// (base64). On failure this responds directly (403/503) and never calls
// next() — every branch inside verifyFace() is a controlled rejection,
// there's no silent-pass path. On success it attaches
// `req.faceVerification = { confidence }` for the controller to log
// alongside its own audit entry if useful, and continues.
export function requireFaceVerification(actionType) {
  return async (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Authentication required.' });

    const result = await verifyFace({
      userId: req.user.id,
      actionType,
      capturedImageBase64: req.body?.faceCapture,
      ip: req.ip,
    });

    if (!result.passed) {
      const status = result.rejectReason === 'not_configured' ? 503 : 403;
      return res.status(status).json({ error: result.message, rejectReason: result.rejectReason });
    }

    req.faceVerification = { confidence: result.confidence };
    next();
  };
}
