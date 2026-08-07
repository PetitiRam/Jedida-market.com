-- JEDIDA Marketplace — Phase 5 schema
-- Hardened auth (lockout tracking), PETITI-tunable security policy,
-- media uploads (image/video), Google OAuth identity linking.

-- ===== Login attempts — brute-force / credential-stuffing defense =====
CREATE TABLE login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL,
  ip_address  VARCHAR(64),
  success     BOOLEAN NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at DESC);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, created_at DESC);

-- account-level lockout state (separate from users.status so a lockout is
-- automatic/temporary and distinct from an admin-issued suspension)
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(8);

-- ===== Auth security policy — a singleton row PETITI (and admins) can tune
-- without touching code. authController.js reads these at request time. =====
CREATE TABLE auth_security_policy (
  id                        INTEGER PRIMARY KEY DEFAULT 1,
  max_failed_logins         INTEGER NOT NULL DEFAULT 5,
  lockout_minutes           INTEGER NOT NULL DEFAULT 15,
  otp_expiry_minutes        INTEGER NOT NULL DEFAULT 10,
  otp_resend_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  min_password_length       INTEGER NOT NULL DEFAULT 8,
  require_password_complexity BOOLEAN NOT NULL DEFAULT TRUE,
  access_token_ttl          VARCHAR(20) NOT NULL DEFAULT '15m',
  refresh_token_ttl         VARCHAR(20) NOT NULL DEFAULT '7d',
  updated_by                VARCHAR(20) NOT NULL DEFAULT 'system', -- 'system' | 'admin' | 'petiti'
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
INSERT INTO auth_security_policy (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ===== Media uploads (image/video) — generic, reusable across products,
-- shop logos/banners, avatars, KYC docs =====
CREATE TYPE media_type AS ENUM ('image', 'video', 'document');

CREATE TABLE media_uploads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  media_type   media_type NOT NULL,
  url          TEXT NOT NULL,
  thumbnail_url TEXT,
  provider     VARCHAR(30) NOT NULL DEFAULT 'local', -- 'cloudinary' | 'local'
  bytes        INTEGER,
  width        INTEGER,
  height       INTEGER,
  duration_seconds INTEGER, -- for video
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_uploads_user ON media_uploads(uploaded_by, created_at DESC);

-- products can now carry a video alongside images
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT;
