-- ============================================================
-- schema_phase88_wanted_feed.sql
-- Jedida Wanted → public social-style feed (brief §9, §10, §15, §16,
-- §17). Purely additive on top of phase77 + phase87.
--
-- Design notes:
-- * visibility is buyer-controlled per §15: 'public' | 'private'.
--   ('followers_community' and 'invited_suppliers' are listed in the
--   brief as admin-controlled OPTIONS to expose later — not implemented
--   here because there is no follower graph or supplier-invite list in
--   this codebase yet, and the brief explicitly says "Admin must
--   control which options are available" / "do not introduce
--   unnecessary social infrastructure if the existing architecture
--   already supports it." Faking those two options now would mean
--   either silently no-op-ing them or inventing infrastructure the
--   brief says not to invent. The enum below only fabricates a locked
--   'private' value it is not yet possible to bypass — a fully honest,
--   working two-state visibility switch beats a four-state one where
--   half the states are decorative.)
-- * wanted_replies is the SOCIAL reply from brief §16/§17 — distinct
--   from wanted_request_quotes (the structured commercial Offer).
--   "A reply can express interest. An Offer contains structured
--   information." Only B2B_ROLES businesses may still submit an actual
--   Offer (quote); anyone who can see the post may leave a reply.
-- * Every reply's body is passed through the SAME
--   contactModerationEngine.scanMessageText() already wired into quote
--   messages (phase87) — no second detection system (brief §6).
-- * reply_count mirrors the existing like_count (phase87) pattern —
--   a denormalized counter kept in sync in the same transaction as the
--   insert, for fast feed rendering without a COUNT() subquery per row.
-- ============================================================

CREATE TYPE wanted_visibility AS ENUM ('public', 'private');

ALTER TABLE wanted_requests
  ADD COLUMN IF NOT EXISTS visibility  wanted_visibility NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_wanted_requests_feed
  ON wanted_requests(visibility, status, created_at DESC)
  WHERE visibility = 'public';

-- ------------------------------------------------------------
-- REPLIES — social reply, not a commercial Offer (brief §17).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wanted_replies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wanted_request_id UUID NOT NULL REFERENCES wanted_requests(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  -- Set when this reply is a business flagging "we can supply this" and
  -- linking to the structured Offer it went on to submit — lets the
  -- feed UI render "View Offer" under a reply without duplicating data.
  quote_id          UUID REFERENCES wanted_request_quotes(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_wanted_replies_request ON wanted_replies(wanted_request_id, created_at);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_reply_received';
