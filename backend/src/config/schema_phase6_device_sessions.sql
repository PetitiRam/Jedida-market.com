-- Phase 6: device-aware sessions. Additive only — every column is nullable
-- with no default that changes existing rows' meaning, so current web
-- logins (which never send device info) keep working unchanged. Lets
-- GET /api/auth/sessions show "iPhone 15 · last active 2h ago" instead of
-- an opaque token id, and lets a user revoke one device without signing
-- everyone out (logout-all already covered the blunt version of this).

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS platform TEXT; -- 'ios' | 'android' | 'desktop' | 'web'
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
  ON refresh_tokens (user_id)
  WHERE revoked = FALSE;
