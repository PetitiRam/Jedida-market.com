-- ============================================================
-- schema_phase53_stays_dashboards.sql
-- Jedida Stays — Phase D: polished Host + Guest dashboards.
--
-- Adds only what a dashboard overview needs that doesn't already
-- exist: a saved-properties list (product_wishlists, phase17, is
-- products-only and can't be reused for a stays_properties FK).
-- Everything else a dashboard shows (messages, notifications,
-- receipts/invoices) is read from the systems that already own that
-- data — no parallel copies.
-- ============================================================

CREATE TABLE IF NOT EXISTS stays_saved_properties (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id   UUID NOT NULL REFERENCES stays_properties(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_stays_saved_user ON stays_saved_properties(user_id);
