-- Phase 57: Full KYC wizard (Account -> Identity -> Documents -> Face ->
-- Business -> Review). Extends the existing kyc_submissions table rather
-- than replacing it, so the original one-shot flow (WalletKycPanel ->
-- POST /kyc/submit) keeps working untouched.
--
-- Design choice: the new step data (documents, OCR extraction, face-check
-- metadata, business info, payment method) is stored as JSONB rather than
-- fully normalized columns. This is a wizard with many optional/evolving
-- fields per applicant type (buyer vs seller vs business vs delivery), and
-- normalizing all of it now would mean a schema migration every time a
-- field is added. Indexed scalar columns are kept for anything the admin
-- dashboard or fraud checks need to query/filter on directly.

ALTER TYPE kyc_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE kyc_status ADD VALUE IF NOT EXISTS 'manual_review';

ALTER TABLE kyc_submissions
  ADD COLUMN IF NOT EXISTS current_step        SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS full_name            TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth        DATE,
  ADD COLUMN IF NOT EXISTS nationality          TEXT,
  ADD COLUMN IF NOT EXISTS country              TEXT,
  ADD COLUMN IF NOT EXISTS district             TEXT,
  ADD COLUMN IF NOT EXISTS national_id_number   TEXT,
  ADD COLUMN IF NOT EXISTS passport_number      TEXT,
  ADD COLUMN IF NOT EXISTS driving_permit_number TEXT,
  ADD COLUMN IF NOT EXISTS tin_number           TEXT,
  ADD COLUMN IF NOT EXISTS documents            JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ocr_data             JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS face_check           JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS business             JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_method       JSONB NOT NULL DEFAULT '{}',
  -- Placeholder scores. NULL until a real fraud/face-match model is wired
  -- in — see backend/src/services/kycRiskEngine.js. The UI must never
  -- treat a NULL/placeholder score as a pass.
  ADD COLUMN IF NOT EXISTS face_match_score     NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_risk_score        NUMERIC,
  ADD COLUMN IF NOT EXISTS risk_flags           JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

-- One draft/in-progress row per user (mirrors the existing partial unique
-- index that already guards "one pending submission per user").
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_draft_per_user
  ON kyc_submissions (user_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_kyc_national_id ON kyc_submissions (national_id_number)
  WHERE national_id_number IS NOT NULL;
