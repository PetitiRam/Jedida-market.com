-- Phase 72: Face verification gate for high-risk actions.
--
-- Nothing in the codebase actually performed live face matching before
-- this — kyc_submissions.face_match_score (phase57) is explicitly a
-- placeholder ("NULL until a real fraud/face-match model is wired in...
-- the UI must never treat a NULL/placeholder score as a pass"). This
-- phase wires in a real, pluggable face-match provider and the gate
-- itself; see faceVerificationService.js and
-- middleware/faceVerification.js.

-- Singleton config, editable from the Security Center — mirrors the
-- auth_security_policy pattern (phase5).
CREATE TABLE IF NOT EXISTS face_verification_config (
  id                SMALLINT PRIMARY KEY DEFAULT 1,
  provider          TEXT NOT NULL DEFAULT 'none', -- 'none' | 'aws_rekognition'
  match_threshold   NUMERIC NOT NULL DEFAULT 90,   -- percent confidence required to pass
  enabled           BOOLEAN NOT NULL DEFAULT FALSE, -- master switch — off until an admin turns it on post-setup
  updated_by        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT face_verification_config_singleton CHECK (id = 1)
);
INSERT INTO face_verification_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Every attempt, pass or fail — this is the audit trail for "who tried to
-- withdraw/promote/approve-a-large-payment and did their face match".
CREATE TABLE IF NOT EXISTS face_verification_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  action_type       TEXT NOT NULL, -- 'withdrawal' | 'admin_role_grant' | 'large_payment_approval' | ...
  reference_source  TEXT,          -- which KYC submission's selfie was used as the reference
  provider          TEXT NOT NULL,
  matched           BOOLEAN NOT NULL,
  confidence        NUMERIC,
  reject_reason     TEXT,          -- 'no_reference_selfie' | 'not_configured' | 'below_threshold' | 'provider_error' | NULL on pass
  ip_address        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_face_verification_attempts_user ON face_verification_attempts (user_id, created_at DESC);

-- Same append-only treatment as platform_security_log/security_events
-- (phase70) — a face-verification attempt record is exactly the kind of
-- row that must not be editable after the fact.
CREATE OR REPLACE FUNCTION reject_face_attempt_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('audit.allow_mutation', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'face_verification_attempts rows are append-only and cannot be %', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_face_verification_attempts_no_update ON face_verification_attempts;
CREATE TRIGGER trg_face_verification_attempts_no_update
  BEFORE UPDATE OR DELETE ON face_verification_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_face_attempt_mutation();
