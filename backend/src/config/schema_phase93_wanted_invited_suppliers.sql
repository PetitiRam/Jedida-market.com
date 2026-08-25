-- ============================================================
-- schema_phase93_wanted_invited_suppliers.sql
-- Jedida Wanted → buyer-controlled supplier invitations (brief §54:
-- "Businesses can create private requests. Only invited/eligible
-- suppliers see them."). Purely additive on top of phase77/87-92.
--
-- Design notes:
-- * No new table. wanted_request_matches (phase77) already models
--   "this business may see and quote on this request" via its
--   UNIQUE(wanted_request_id, business_id) row — that's exactly what a
--   manual invitation is too. Reusing it means the comparison,
--   negotiation, offer-submission and admin-moderation code from
--   phases 88-92 all work on invited suppliers with zero changes.
-- * invited_by distinguishes an AI-generated match (NULL — see
--   classifyWantedRequest/matchWantedRequestToBusinesses) from a
--   buyer-invited one (the buyer's user id), for the UI ("AI matched"
--   vs "Invited by you") and for audit. match_score/match_reasons
--   already carry the AI explanation for the former; a buyer invite
--   sets match_score = 0 and a plain match_reasons entry instead of
--   fabricating a score for a decision a human made, not the matcher.
-- ============================================================

ALTER TABLE wanted_request_matches
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
