-- ============================================================
-- schema_phase33_partner_portal.sql
-- Phase 3 of the JEDIDA Partner Program: the Partner Portal.
-- Purely additive — new enum values, new nullable columns, new
-- tables only. Nothing existing is altered, dropped, or renamed.
-- ============================================================

-- ---------------------------------------------------------------------
-- A partner is a real, signed-in platform user once approved. Same
-- `users` table, same login/session/password-reset machinery everyone
-- else already uses — just a new value in the existing role enum.
-- ADD VALUE must not be used in the same transaction it's referenced in,
-- so this file only adds it; nothing below depends on it existing yet
-- within this same migration run.
-- ---------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'partner';

-- New in-app notification categories used by the portal (partnership
-- updates, API/webhook changes, support replies, security alerts,
-- maintenance notices) — additive values on the existing enum.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_update';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_api_change';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_support_response';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_security_alert';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'partner_maintenance';

-- ---------------------------------------------------------------------
-- Generic account security (TOTP 2FA). Lives on `users` because it's a
-- property of the login itself, not of any one role — but the Partner
-- Portal is the first surface that exposes it in the UI.
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------
-- Link an approved application to the partner's actual login account.
-- Nullable: applications that are pending/rejected/etc. never get one.
-- ---------------------------------------------------------------------
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS logo_url TEXT;
CREATE INDEX IF NOT EXISTS idx_partner_applications_partner_user ON partner_applications(partner_user_id);

-- ---------------------------------------------------------------------
-- Additional contact persons a partner can manage themselves (the
-- primary contact captured at application time still lives on
-- partner_applications and is treated as sensitive — see change
-- requests below).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  full_name       VARCHAR(255) NOT NULL,
  position        VARCHAR(150),
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(30),
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_contacts_app ON partner_contacts(application_id);

-- ---------------------------------------------------------------------
-- Sensitive company-info edits (legal name, registration number,
-- business email, physical address, country) don't apply immediately —
-- they queue here for an admin decision. Non-sensitive fields (website,
-- logo, additional contacts) update partner_applications directly and
-- never touch this table.
-- ---------------------------------------------------------------------
CREATE TYPE partner_change_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS partner_profile_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  changes         JSONB NOT NULL,       -- { field: { from, to } }
  status          partner_change_request_status NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_change_requests_app ON partner_profile_change_requests(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_change_requests_status ON partner_profile_change_requests(status);

-- ---------------------------------------------------------------------
-- API credentials. Only the hash + a display prefix/last-4 are stored;
-- the full key is shown to the partner exactly once, at generation time.
-- ---------------------------------------------------------------------
CREATE TYPE partner_key_status AS ENUM ('active', 'revoked');

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  label           VARCHAR(120) NOT NULL DEFAULT 'Default key',
  key_prefix      VARCHAR(16) NOT NULL,   -- shown alongside last_four to identify the key, e.g. jpk_live_
  last_four       VARCHAR(4) NOT NULL,
  key_hash        VARCHAR(128) NOT NULL,  -- sha256 of the full secret
  environment     VARCHAR(10) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'live')),
  status          partner_key_status NOT NULL DEFAULT 'active',
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_app ON partner_api_keys(application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_api_keys_hash ON partner_api_keys(key_hash);

-- ---------------------------------------------------------------------
-- Webhooks a partner registers to receive platform events.
-- ---------------------------------------------------------------------
CREATE TYPE partner_webhook_status AS ENUM ('active', 'disabled');

CREATE TABLE IF NOT EXISTS partner_webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  callback_url    TEXT NOT NULL,
  events          TEXT[] NOT NULL DEFAULT '{}',
  signing_secret  VARCHAR(64) NOT NULL,
  status          partner_webhook_status NOT NULL DEFAULT 'active',
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  last_triggered_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_webhooks_app ON partner_webhooks(application_id);

-- ---------------------------------------------------------------------
-- Sandbox activity: test API calls and test webhook deliveries, plus
-- the running "integration logs" feed shown in the Sandbox section.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_sandbox_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  kind            VARCHAR(30) NOT NULL,  -- 'api_test' | 'webhook_test'
  target          TEXT,                  -- endpoint or webhook URL exercised
  request_payload JSONB,
  response_payload JSONB,
  status_code     INTEGER,
  success         BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms     INTEGER,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_sandbox_logs_app ON partner_sandbox_logs(application_id, created_at DESC);

-- ---------------------------------------------------------------------
-- Support tickets, threaded messages, and attachments.
-- ---------------------------------------------------------------------
CREATE TYPE partner_ticket_status AS ENUM ('open', 'pending', 'resolved', 'closed');
CREATE TYPE partner_ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE IF NOT EXISTS partner_support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  subject         VARCHAR(255) NOT NULL,
  category        VARCHAR(60) NOT NULL DEFAULT 'general',
  priority        partner_ticket_priority NOT NULL DEFAULT 'medium',
  status          partner_ticket_status NOT NULL DEFAULT 'open',
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_tickets_app ON partner_support_tickets(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_tickets_status ON partner_support_tickets(status);

CREATE TABLE IF NOT EXISTS partner_support_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES partner_support_tickets(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  author_role     VARCHAR(20) NOT NULL, -- 'partner' | 'admin'
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_messages_ticket ON partner_support_messages(ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS partner_support_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL REFERENCES partner_support_messages(id) ON DELETE CASCADE,
  file_name       VARCHAR(255) NOT NULL,
  file_url        TEXT NOT NULL,
  bytes           INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_attachments_message ON partner_support_attachments(message_id);

CREATE TRIGGER trg_partner_support_tickets_updated_at BEFORE UPDATE ON partner_support_tickets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_partner_webhooks_updated_at BEFORE UPDATE ON partner_webhooks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_partner_contacts_updated_at BEFORE UPDATE ON partner_contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Portal-side activity timeline / audit log — everything a partner or
-- an admin acting on their behalf does inside the portal itself.
-- Distinct from partner_application_audit_log (Phase 2), which covers
-- the admin review pipeline before approval.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_portal_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role      VARCHAR(20) NOT NULL DEFAULT 'partner', -- 'partner' | 'admin' | 'system'
  action          VARCHAR(60) NOT NULL,
  details         JSONB DEFAULT '{}',
  ip_address      VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_portal_audit_app ON partner_portal_audit_log(application_id, created_at DESC);
