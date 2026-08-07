-- ============================================================
-- schema_phase52_stays_pass.sql
-- Jedida Stays — Phase C: Digital Stay Pass.
--
-- Reused unchanged:
--   - services/qrService.js (generateQrDataUrl / verificationUrl pattern)
--   - services/documentNumberService.js — 'stays_pass' added to its
--     PREFIXES map so pass numbers come from the exact same atomic
--     per-year sequence counter documents already use, and
--     generateVerificationCode() is reused as-is for the pass code.
--   - pdfkit (already a dependency via services/pdfService.js) for the
--     downloadable pass PDF.
-- Not reused: the generic `documents` table. A Stay Pass isn't a
-- financial document (no line items/totals to restate) — it's a
-- travel credential — so it gets its own small table instead of
-- being force-fit into document_type.
-- ============================================================

CREATE TYPE stays_pass_status AS ENUM ('valid', 'expired', 'revoked');

CREATE TABLE IF NOT EXISTS stays_stay_passes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL UNIQUE REFERENCES stays_bookings(id) ON DELETE CASCADE,
  pass_number       VARCHAR(40) NOT NULL UNIQUE,      -- JD-STP-2026-000001 (documentNumberService)
  verification_code VARCHAR(32) NOT NULL UNIQUE,       -- generateVerificationCode()

  -- Snapshot at issue time so the pass stays correct even if the guest
  -- renames their account or a host edits the listing afterwards.
  guest_name        VARCHAR(255) NOT NULL,
  host_name         VARCHAR(255) NOT NULL,
  property_name     VARCHAR(255) NOT NULL,
  property_address  VARCHAR(255),
  emergency_contact  VARCHAR(255),

  check_in          DATE NOT NULL,
  check_out         DATE NOT NULL,
  guests_count      INTEGER NOT NULL,

  status            stays_pass_status NOT NULL DEFAULT 'valid',
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,   -- check_out + 24h grace, see staysPassService.js
  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT,

  digital_signature VARCHAR(64) NOT NULL,   -- HMAC-SHA256 over the fields above, see staysPassService.js
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stays_passes_verification ON stays_stay_passes(verification_code);

-- Secure share links — a guest can hand this pass to someone else
-- (e.g. a driver, a family member) without exposing the underlying
-- booking/payment. Each share link has its own expiry (the "Expiration
-- Engine" in the spec: hourly/daily/weekend/weekly/custom) and can be
-- revoked independently of the pass itself.
CREATE TABLE IF NOT EXISTS stays_pass_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id       UUID NOT NULL REFERENCES stays_stay_passes(id) ON DELETE CASCADE,
  share_token   VARCHAR(64) NOT NULL UNIQUE,
  label         VARCHAR(100),          -- guest's own note, e.g. "For the driver"
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stays_pass_shares_token ON stays_pass_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_stays_pass_shares_pass ON stays_pass_shares(pass_id);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_pass_ready';
