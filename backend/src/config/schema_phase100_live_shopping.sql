-- ============================================================
-- schema_phase100_live_shopping.sql
-- Jedida Live Shopping (spec: "Cloudflare Stream + Go Implementation
-- Specification"). Video infrastructure is Cloudflare Stream; Jedida
-- stores only identifiers/metadata, never video bytes. Run by the same
-- Node migrate.js as every other phase — the Go Live service (see
-- services/live-go/) reads/writes this database but does not own a
-- separate migration tool, per spec §28 ("reuse the existing PostgreSQL
-- database").
-- ============================================================

CREATE TYPE live_event_status AS ENUM ('draft','scheduled','ready','live','ending','ended','cancelled','suspended');
CREATE TYPE live_question_status AS ENUM ('pending','approved','answered','rejected');
CREATE TYPE live_report_status AS ENUM ('open','reviewed','dismissed','actioned');
CREATE TYPE live_recording_status AS ENUM ('none','processing','ready','failed');

CREATE TABLE IF NOT EXISTS live_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id                 UUID NOT NULL REFERENCES users(id),
  shop_id                   UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title                     VARCHAR(255) NOT NULL,
  description               TEXT,
  thumbnail_url             TEXT,
  status                    live_event_status NOT NULL DEFAULT 'draft',
  visibility                VARCHAR(20) NOT NULL DEFAULT 'public',
  scheduled_at              TIMESTAMPTZ,
  started_at                TIMESTAMPTZ,
  ended_at                  TIMESTAMPTZ,
  -- Cloudflare identifiers only — never the stream key. See
  -- internal/cloudflare/live_inputs.go: the key is returned once to the
  -- authorized seller at creation time and is not persisted in this table.
  cloudflare_live_input_uid VARCHAR(64),
  cloudflare_video_uid      VARCHAR(64),
  recording_status          live_recording_status NOT NULL DEFAULT 'none',
  peak_viewers              INTEGER NOT NULL DEFAULT 0,
  total_unique_viewers      INTEGER NOT NULL DEFAULT 0,
  -- Idempotency for Start/End (spec §32) — a duplicate "start" tap with
  -- the same client-generated key is a no-op replay, not a second
  -- Cloudflare Live Input.
  start_idempotency_key     UUID,
  end_idempotency_key       UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_events_shop ON live_events(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_events_status ON live_events(status) WHERE status IN ('live','scheduled','ready');
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_events_start_key ON live_events(start_idempotency_key) WHERE start_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS live_products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_event_id  UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id      UUID NOT NULL REFERENCES users(id),
  position       INTEGER NOT NULL DEFAULT 0,
  featured       BOOLEAN NOT NULL DEFAULT FALSE,
  featured_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(live_event_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_live_products_event ON live_products(live_event_id);
-- At most one featured product per live at a time (spec §11: feature /
-- unfeature / change featured product implies a single current one).
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_products_one_featured
  ON live_products(live_event_id) WHERE featured = TRUE;

CREATE TABLE IF NOT EXISTS live_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_event_id  UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id),
  text           TEXT NOT NULL,
  status         live_question_status NOT NULL DEFAULT 'pending',
  answered_by    UUID REFERENCES users(id),
  answered_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_questions_event ON live_questions(live_event_id, status);

-- Aggregate-only (spec §15/§24): individual viewer heartbeats live in the
-- Go process's in-memory presence map, never in Postgres. This table is
-- written once per viewer per event (first join), not per heartbeat.
CREATE TABLE IF NOT EXISTS live_viewers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_event_id  UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at        TIMESTAMPTZ,
  UNIQUE(live_event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_live_viewers_event ON live_viewers(live_event_id);

CREATE TABLE IF NOT EXISTS live_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_event_id  UUID NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  reporter_id    UUID NOT NULL REFERENCES users(id),
  reason         TEXT NOT NULL,
  status         live_report_status NOT NULL DEFAULT 'open',
  reviewed_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_live_reports_status ON live_reports(status) WHERE status = 'open';

-- Per-event rollup, computed at end-of-live (spec §24) — chat message
-- counts etc. come from the Go chat hub's own counters at that moment,
-- not a live COUNT(*) query.
CREATE TABLE IF NOT EXISTS live_analytics (
  live_event_id       UUID PRIMARY KEY REFERENCES live_events(id) ON DELETE CASCADE,
  duration_seconds     INTEGER,
  peak_viewers         INTEGER NOT NULL DEFAULT 0,
  total_unique_viewers INTEGER NOT NULL DEFAULT 0,
  chat_messages        INTEGER NOT NULL DEFAULT 0,
  questions_count      INTEGER NOT NULL DEFAULT 0,
  product_views        INTEGER NOT NULL DEFAULT 0,
  product_clicks       INTEGER NOT NULL DEFAULT 0,
  add_to_cart_events   INTEGER NOT NULL DEFAULT 0,
  orders_count         INTEGER NOT NULL DEFAULT 0,
  gross_sales          NUMERIC(14,2) NOT NULL DEFAULT 0,
  refunds              NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform-configurable cost controls (spec §25) — not hardcoded. Read by
-- the Go service on each relevant call; admin edits these the same way
-- platform_settings is edited elsewhere in Jedida.
CREATE TABLE IF NOT EXISTS live_platform_settings (
  id                        INTEGER PRIMARY KEY DEFAULT 1,
  max_live_duration_minutes INTEGER NOT NULL DEFAULT 180,
  max_recording_retention_days INTEGER NOT NULL DEFAULT 90,
  max_simultaneous_lives    INTEGER NOT NULL DEFAULT 50,
  default_monthly_live_limit INTEGER NOT NULL DEFAULT 8,
  require_signed_playback_urls BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_live_platform_settings_singleton CHECK (id = 1)
);
INSERT INTO live_platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Registered on the existing feature engine (phase85) exactly like POS —
-- "eligible/approved sellers only" (spec §21) is the eligible_roles /
-- per-shop activation mechanism that already exists, not a new
-- verification system.
INSERT INTO feature_flags (key, name, description, category, global_status, eligible_roles)
VALUES ('live_shopping', 'Live Shopping', 'Host live-streamed selling events with real-time chat, questions, and in-stream purchasing.', 'commerce', 'available', '{}')
ON CONFLICT (key) DO NOTHING;

-- Reuses the existing notification system (spec §23: "do not create a
-- second notification system") — the Go service inserts directly into
-- this same `notifications` table Node already reads/writes/serves.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'seller_went_live';
