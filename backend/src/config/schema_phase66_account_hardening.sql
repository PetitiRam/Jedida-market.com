-- JEDIDA Marketplace — Phase 66 schema
-- Account Hardening: password history (prevent reuse), forced password
-- reset after suspicious activity, one-active-session enforcement (config-
-- urable), and idle session expiration. must_change_password already
-- exists on users (schema_phase33_partner_portal.sql) — this phase adds
-- the reason column and extends enforcement to the main login flow.

CREATE TABLE password_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_history_user ON password_history(user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password_reason TEXT;

-- Same PETITI/admin-tunable singleton auth_security_policy row that
-- authController.js already reads at request time (schema_phase5.sql) —
-- these three knobs just extend it rather than introducing a second
-- policy table.
ALTER TABLE auth_security_policy ADD COLUMN IF NOT EXISTS password_history_limit INTEGER NOT NULL DEFAULT 5;
ALTER TABLE auth_security_policy ADD COLUMN IF NOT EXISTS idle_session_timeout_minutes INTEGER NOT NULL DEFAULT 20160; -- 14 days
ALTER TABLE auth_security_policy ADD COLUMN IF NOT EXISTS single_session_enforced BOOLEAN NOT NULL DEFAULT FALSE;
