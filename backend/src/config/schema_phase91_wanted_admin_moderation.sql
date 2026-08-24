-- ============================================================
-- schema_phase91_wanted_admin_moderation.sql
-- Jedida Wanted → admin moderation dashboard (brief §36). Purely
-- additive on top of phase77/83/84/85/86.
--
-- Design notes:
-- * Mirrors the existing shop_feed_posts moderation pattern
--   (shopFeedController.js: status='removed_by_admin', removed_reason,
--   removed_by) rather than inventing a new shape — same admin mental
--   model, same UI conventions.
-- * pre_removal_status captures the request's status at the moment of
--   removal so "restore" can put it back exactly where it was (e.g. a
--   request mid-negotiation with 'quoted' status restores to 'quoted',
--   not silently reset to 'submitted').
-- * No new "flagged messages" or "reports" table here — the audit
--   trail from phase77 (wanted_request_audit_log) already records
--   every blocked contact-sharing/off-platform attempt via
--   logWantedAction() across quotes (phase87), replies (phase88), and
--   negotiation (phase90). The admin endpoint added in this phase
--   queries that existing log rather than duplicating it into a
--   second table.
-- ============================================================

ALTER TYPE wanted_request_status ADD VALUE IF NOT EXISTS 'removed_by_admin';

ALTER TABLE wanted_requests
  ADD COLUMN IF NOT EXISTS removed_reason      TEXT,
  ADD COLUMN IF NOT EXISTS removed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pre_removal_status  VARCHAR(20);
