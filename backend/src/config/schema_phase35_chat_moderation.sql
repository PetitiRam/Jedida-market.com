-- Phase 35: Chat contact-sharing moderation, blocking, reporting, and
-- conversation organization (pin/archive) for the marketplace chat upgrade.
-- Builds on the existing chat_conversations/chat_messages (phase 3/8).

-- Cumulative chat trust-risk score per user (0-100), separate from the
-- general fraud_reports average so contact-sharing behavior is tracked even
-- before it rises to a platform-wide fraud_reports entry.
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_risk_score INTEGER NOT NULL DEFAULT 0
  CHECK (chat_risk_score BETWEEN 0 AND 100);

-- Marks a message as sent by a verified admin/official support account so
-- the UI can render the "Official Jedida Administrator" badge without a
-- join back to users on every render.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;

-- moderation_status: 'clean' | 'masked' | 'blocked'. When masked, `body`
-- already holds the redacted text and `original_body` keeps the real text
-- for admin review only (never sent to the other participant).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'clean';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS original_body TEXT;

-- Per-conversation UI organization, scoped to the viewer since a buyer and
-- seller may each want to pin/archive their own side independently.
CREATE TABLE IF NOT EXISTS chat_conversation_states (
  conversation_id  UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned           BOOLEAN NOT NULL DEFAULT FALSE,
  archived         BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Every detected contact-sharing / off-platform attempt, for admin review
-- and for computing recent-violation counts (risk escalation).
CREATE TABLE IF NOT EXISTS chat_moderation_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id        UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id),
  action            VARCHAR(20) NOT NULL, -- 'mask' | 'block'
  categories        JSONB NOT NULL DEFAULT '[]',
  details           JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_moderation_user_time ON chat_moderation_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_moderation_conversation ON chat_moderation_events(conversation_id, created_at DESC);

-- User-to-user blocking. A block is one-directional; the app checks both
-- directions before allowing a new message.
CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- User-filed message reports, reviewed from the admin Security Center
-- alongside PETITI's own fraud_reports.
CREATE TYPE chat_report_status AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

CREATE TABLE IF NOT EXISTS chat_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  conversation_id   UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  reporter_id       UUID NOT NULL REFERENCES users(id),
  reported_user_id  UUID REFERENCES users(id),
  reason            VARCHAR(60) NOT NULL, -- 'contact_sharing','scam','harassment','hate_speech','nudity','other'
  details            TEXT,
  status            chat_report_status NOT NULL DEFAULT 'open',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_reports_status ON chat_reports(status, created_at DESC);

-- Media/document message support (image/video/document/voice-note cards),
-- reusing the platform's existing upload pipeline (uploadsController.js /
-- cloudinaryClient.js) for storage — this table just links the resulting
-- URL to a chat message.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_meta JSONB NOT NULL DEFAULT '{}';

-- Forwarding: keeps a pointer to the original message being forwarded.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS forwarded_from_id UUID REFERENCES chat_messages(id);

-- Voice notes (chat) reuse the existing media_uploads pipeline, which only
-- had 'image'/'video'/'document' — add 'audio' so voice notes get their own
-- type instead of being misfiled as video. Postgres requires ADD VALUE to
-- run outside a transaction block in older versions, but is safe as a
-- standalone ALTER here.
ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'audio';
ALTER TABLE media_uploads ADD COLUMN IF NOT EXISTS original_name TEXT;
