-- ============================================================
-- schema_phase90_wanted_negotiation.sql
-- Jedida Wanted → in-platform negotiation on an Offer (brief §28).
-- Purely additive on top of phase77/83/84/85.
--
-- Design notes:
-- * The codebase already has an identical-shaped negotiation feature —
--   quote_messages, keyed to quote_requests (phase41's targeted RFQ
--   flow) — but its status gate ('accepted'/'declined'/'expired') and
--   party lookup are hard-coded to that table, and it's a live,
--   already-tested piece of the RFQ/purchase-agreement pipeline.
--   Rewiring it to also understand wanted_request_quotes' different
--   status enum (wanted_quote_status: submitted/accepted/declined/
--   withdrawn) risks that existing flow for no real benefit. Per the
--   phase77 header's own precedent (a dedicated wanted_request_
--   audit_log instead of reusing dropship_audit_log), this adds one
--   small dedicated table instead — same message+counter-offer shape,
--   zero risk to the existing bulk-order negotiation code.
-- * Every message goes through the same contactModerationEngine
--   already used for quote messages/replies (phase87/84) — negotiation
--   free text is exactly the channel brief §28 calls out ("Never tell
--   users to continue on WhatsApp...").
-- * Only the buyer and the offering business may post — enforced in
--   the controller from wanted_request_quotes/wanted_requests, not
--   duplicated here.
-- ============================================================

CREATE TABLE IF NOT EXISTS wanted_quote_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wanted_quote_id   UUID NOT NULL REFERENCES wanted_request_quotes(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message           TEXT NOT NULL DEFAULT '',
  proposed_unit_price NUMERIC(14,2),
  proposed_moq      INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (proposed_unit_price IS NULL OR proposed_unit_price >= 0),
  CHECK (proposed_moq IS NULL OR proposed_moq > 0),
  CHECK (char_length(message) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_wanted_quote_messages_quote ON wanted_quote_messages(wanted_quote_id, created_at);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wanted_negotiation_message';
