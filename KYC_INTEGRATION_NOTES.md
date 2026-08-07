# KYC Feature — Integrated Into This Build

This zip is your uploaded project with the identity-verification wizard and
admin review console merged directly in (routes, imports, and tabs are
already wired — nothing to manually splice into App.jsx/AdminPanel.jsx/
server.js).

## What's included

- **User flow** at `/verify-identity` (linked from the wallet's "Verify
  your identity" panel): Account → Identity → Documents → Face → Business
  (if applicable) → Payment → Review, with autosave.
- **Admin review console**: Admin Panel → "🪪 KYC Verification Center" tab.
- **Migrations**: `backend/src/config/schema_phase57_kyc_verification_v2.sql`
  and `schema_phase58_kyc_admin_review.sql` (numbered after your existing
  phase56 — your migration runner picks these up automatically on next boot).

## Two manual steps before this runs

1. **Install two frontend packages** (already added to `package.json`,
   just need installing):
   ```bash
   cd frontend && npm install
   ```
2. **Download the face-detection model weights** (a few MB, not something
   I can fetch without network access in this session) into
   `frontend/public/models/`:
   - `tiny_face_detector_model-weights_manifest.json` + `.bin`
   - `face_landmark_68_model-weights_manifest.json` + `.bin`

   From: https://github.com/justadudewhohacks/face-api.js/tree/master/weights

Everything else — backend routes, DB columns, the `/verify-identity` route,
the admin tab — is already in place; just run your normal migration step
and restart.

## Still honestly incomplete (by design, not oversight)

- No document-forgery or deepfake/anti-spoofing model is connected. The
  in-browser face/liveness checks (real face detection, blink/turn
  challenge) are a genuine quality signal, not a certified anti-spoofing
  system — see the comments at the top of `frontend/src/utils/faceDetection.js`.
- No `face_match_score`/`ai_risk_score` is populated — every submission
  routes to manual review until you connect a vendor (AWS Rekognition
  Liveness, Onfido, iProov, FaceTec) or a self-hosted model. That's a
  decision for you, not something I can pick and wire up blind.
- Mobile money/bank account ownership isn't automatically verified —
  flagged for manual admin confirmation.
