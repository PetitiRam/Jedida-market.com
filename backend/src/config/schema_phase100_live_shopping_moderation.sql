-- Phase 100b: Live Shopping moderation, ported from jedida-chat-parity-final
-- (schema_phase94_live_events.sql), adapted to the adopted schema's naming
-- (live_events, not live_sessions).
--
-- See INTEGRATION_DECISION_REPORT.md section 5 and
-- LIVE_SHOPPING_PHASE1_NOTES.md's own "Still not built" list: the adopted
-- Cloudflare-backed Live Shopping foundation has only live_reports (a
-- report QUEUE) — no actual mute/ban/moderation-ACTION tables. This adds
-- the real enforcement primitives chat-parity-final already had for its
-- (video-less) live sessions.

CREATE TABLE IF NOT EXISTS live_moderation_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_event_id       UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  moderator_id        UUID NOT NULL REFERENCES users(id),
  target_user_id      UUID REFERENCES users(id),
  target_message_id   UUID, -- no FK to the Go hub's in-memory/ephemeral chat messages -- history survives a hidden message
  action              VARCHAR(30) NOT NULL
                        CHECK (action IN ('hide_message', 'mute_user', 'unmute_user', 'remove_viewer', 'ban_user')),
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_moderation_event ON live_moderation_actions(live_event_id, created_at);

CREATE TABLE IF NOT EXISTS live_muted_users (
  live_event_id       UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_by            UUID NOT NULL REFERENCES users(id),
  muted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (live_event_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_banned_users (
  live_event_id       UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by           UUID NOT NULL REFERENCES users(id),
  banned_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (live_event_id, user_id)
);

-- live_viewers already covers join/leave/rejoin (UNIQUE(live_event_id,
-- user_id) + joined_at/left_at, upsert-friendly) -- chat-parity's
-- live_participants added a role distinction and an explicit connected
-- flag on top of that same shape, so those two columns are added here
-- rather than importing a whole second viewer-tracking table.
ALTER TABLE live_viewers ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'viewer';
DO $$ BEGIN
  ALTER TABLE live_viewers ADD CONSTRAINT chk_live_viewers_role CHECK (role IN ('host', 'agent', 'viewer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE live_viewers ADD COLUMN IF NOT EXISTS is_connected BOOLEAN NOT NULL DEFAULT TRUE;
