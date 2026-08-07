-- Phase 52: PETITI Autonomous Security & Threat Response Engine.
-- Additive only, same convention as schema_phase6/43: nullable/defaulted
-- columns so existing rows and existing code paths are unaffected until
-- the response engine actually touches them.
--
-- Deliberately reuses what already exists rather than inventing parallel
-- tables: fraud_reports (detection), ai_alerts / ai_actions / ai_logs
-- (PETITI's existing audit surfaces via petitiService.js), and
-- platform_security_log (the general admin timeline). This file only adds
-- what those tables genuinely can't represent: an account's current
-- containment state, a shared IP blocklist, and a platform-wide emergency
-- flag.

-- ------------------------------------------------------------
-- Account security state — the Low/Medium/High containment tiers.
-- Kept separate from `account_status` (pending/active/suspended/rejected)
-- because that enum already has other meanings (e.g. 'pending' during
-- signup); a security hold is a distinct, PETITI-managed axis that can be
-- lifted independently by an admin without touching onboarding state.
-- 'frozen' is paired with account_status = 'suspended' by the response
-- engine (see petitiResponseEngine.js) so a frozen account is also
-- actually locked out, not just labeled.
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_state VARCHAR(20) NOT NULL DEFAULT 'normal';
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_state_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_state_set_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_state_set_by VARCHAR(30); -- 'petiti' | admin user id (as text) | NULL

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_security_state'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_security_state
      CHECK (security_state IN ('normal', 'flagged', 'restricted', 'frozen'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_security_state ON users(security_state) WHERE security_state <> 'normal';

-- ------------------------------------------------------------
-- Blocked IPs — high-risk automated containment (brute force, revoked
-- admin session abuse, etc). A block is platform-wide, not per-account.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_ips (
  ip            TEXT PRIMARY KEY,
  reason        TEXT NOT NULL,
  blocked_by    VARCHAR(30) NOT NULL DEFAULT 'petiti', -- 'petiti' | admin user id (as text)
  blocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  unblocked_at  TIMESTAMPTZ,
  unblocked_by  UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_active ON blocked_ips(ip) WHERE unblocked_at IS NULL;

-- ------------------------------------------------------------
-- Emergency mode — platform-wide lockdown flag. Entering is automatable
-- by PETITI on a high-severity incident; exiting is enforced
-- admin-only at the route layer (requireSuperAdmin), never in code that
-- PETITI itself can call unattended.
-- ------------------------------------------------------------
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS emergency_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS emergency_mode_reason TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS emergency_mode_enabled_at TIMESTAMPTZ;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS emergency_mode_enabled_by VARCHAR(30);
