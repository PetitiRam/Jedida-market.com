-- ============================================================
-- schema_phase89_wanted_offers.sql
-- Jedida Wanted → structured Offer fields + comparison support
-- (brief §17–§21). Purely additive on top of phase77/83/84.
--
-- Design notes:
-- * §17 distinguishes a plain social reply from a structured Offer.
--   phase88 already gave us the reply side (wanted_replies); this adds
--   the remaining Offer fields the brief lists (§17/§18) that
--   wanted_request_quotes (phase77) didn't yet have: warranty,
--   specifications, availability, and an offer expiry. unit_price,
--   currency, moq and lead_time_days already existed.
-- * availability is a short, bounded enum rather than free text so the
--   comparison UI (§20) can filter/sort on it reliably.
-- * No "condition" column: every quote on this codebase already comes
--   from a verified business's own supply, not a resale listing, so
--   "new / used / refurbished" doesn't apply the way it does to a
--   product listing (which already has its own condition handling).
--   Adding a decorative column nobody would ever set is worse than
--   leaving it out.
-- * §21 "Jedida Recommended" must use real data, never fabricated
--   values — this migration adds no new trust table because one
--   already exists (shop_trust_metrics, trustEngineService.js). The
--   comparison query in wantedController.js LEFT JOINs it directly.
-- ============================================================

ALTER TABLE wanted_request_quotes
  ADD COLUMN IF NOT EXISTS warranty       TEXT,
  ADD COLUMN IF NOT EXISTS specifications TEXT,
  ADD COLUMN IF NOT EXISTS availability   VARCHAR(20)
    CHECK (availability IS NULL OR availability IN ('in_stock', 'made_to_order', 'limited')),
  ADD COLUMN IF NOT EXISTS expires_at     TIMESTAMPTZ;
