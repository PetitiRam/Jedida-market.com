-- ============================================================
-- schema_phase101_profile_identity_rebuild.sql
--
-- Backs the rebuilt PROFILE experience (profileController.js /
-- routes/profile.js). Purely additive — nothing existing is
-- altered, dropped, or renamed, and the existing identity/auth
-- system (users.primary_role, role_upgrades, sessions/JWT) is
-- left completely untouched.
--
-- What this does NOT add, on purpose, because it already exists
-- and the profile layer reads it at query time instead of
-- duplicating it:
--   * "authorized roles" — computed from users.primary_role +
--     role_upgrades (status='approved', distinct requested_role) +
--     business_profiles (active rows, one per business_type) +
--     drivers — see profileController.getAuthorizedRoles().
--   * blocking — reuses chat_blocks (schema_phase35). A block is
--     a block platform-wide (chat + profile visibility + follow),
--     not a second, parallel relationship.
--   * shop follower counts — shop_follows (schema_phase17) is
--     storefront-level and untouched; this file's user_follows is
--     person-level (follow a user, not a shop).
-- ============================================================

-- ===== PROFILE PRIVACY =====
-- Who can view the full public profile. 'public' = anyone (indexable
-- where the route architecture allows it); 'followers' = only
-- confirmed followers see activity/stats, everyone else sees the
-- header only; 'private' = header + follow button only, everything
-- else hidden, mirrors how a private account behaves elsewhere.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) NOT NULL DEFAULT 'public';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_profile_visibility_check;
ALTER TABLE users ADD CONSTRAINT users_profile_visibility_check
  CHECK (profile_visibility IN ('public', 'followers', 'private'));

-- Fine-grained toggles under Settings > Privacy. Independent of
-- profile_visibility so e.g. a public profile can still hide its
-- follower list.
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_followers BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_activity BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_messages_from VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_allow_messages_from_check;
ALTER TABLE users ADD CONSTRAINT users_allow_messages_from_check
  CHECK (allow_messages_from IN ('everyone', 'followers', 'no_one'));

-- ===== USER FOLLOW SYSTEM (person-level, distinct from shop_follows) =====
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id, created_at DESC);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_follower';

-- ===== PROFILE-LEVEL REPORTING =====
-- Separate from chat_reports (message-scoped) and shop_content_reports
-- (storefront-scoped) — this is "report this person's profile" as its
-- own reason set, reviewed from the same admin moderation surface.
CREATE TABLE IF NOT EXISTS user_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason            VARCHAR(60) NOT NULL, -- 'fake_profile','impersonation','scam','harassment','hate_speech','inappropriate_content','other'
  details           TEXT,
  status            chat_report_status NOT NULL DEFAULT 'open',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_user_id, created_at DESC);
