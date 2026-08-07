-- ============================================================
-- schema_phase34_partner_directory_dropshipping.sql
-- Adds: a public "Partner Apps" directory (opt-in per partner),
-- a dropshipping program gated on the seller accepting a partner's
-- instructions, and a lightweight leads inbox for "I'm interested"
-- clicks from the public directory. Purely additive.
-- ============================================================

ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS directory_listed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS directory_tagline VARCHAR(200);
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS directory_category VARCHAR(60);
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS directory_try_url TEXT;
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS dropshipping_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS dropshipping_instructions TEXT;

CREATE INDEX IF NOT EXISTS idx_partner_applications_directory
  ON partner_applications(directory_listed) WHERE directory_listed = TRUE;

-- Anyone browsing the public directory can leave interest without an
-- account (mirrors the public application intake in Phase 1) — the
-- partner sees these as leads inside their portal.
CREATE TABLE IF NOT EXISTS partner_app_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  message         TEXT,
  submitted_ip    VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_app_leads_app ON partner_app_leads(application_id, created_at DESC);

-- A signed-in seller/buyer opts into dropshipping for one partner at a
-- time, and only after acknowledging that specific partner's
-- instructions — "allow dropshipping if the user follows the platform
-- instructions" is enforced by requiring accepted_instructions_snapshot
-- to be non-empty at enrollment time, not just a boolean flag.
CREATE TABLE IF NOT EXISTS partner_dropship_enrollments (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id                UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  user_id                       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_instructions_snapshot TEXT NOT NULL,
  status                        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at                    TIMESTAMPTZ,
  UNIQUE (application_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dropship_enrollments_user ON partner_dropship_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_dropship_enrollments_app ON partner_dropship_enrollments(application_id);

-- Live (as opposed to sandbox) API keys are a stronger credential —
-- track whether 2FA was on and how many live keys already exist so the
-- portal can enforce a cap without an extra query shape at issuance time.
ALTER TABLE partner_api_keys ADD COLUMN IF NOT EXISTS issued_with_2fa BOOLEAN NOT NULL DEFAULT FALSE;
