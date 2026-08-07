-- ============================================================
-- schema_phase54_stays_trust_reviews.sql
-- Jedida Stays — Phase E: Trust Engine badges + verified-stay reviews.
--
-- Reviews mirror shop_reviews (phase43)/product_reviews (phase16) —
-- one review per completed transaction, optional business reply — but
-- with the multi-category rating the spec calls for (Cleanliness,
-- Comfort, Location, Communication, Value, Amenities) instead of a
-- single star rating, since a stay has more dimensions than one SKU.
--
-- Trust badges follow the business_verification_level (phase43)
-- pattern: some are admin-curated, some auto-computed from data —
-- but split across two places because Stays badges are a mix of
-- property-level (Luxury Stay, Clean & Safe) and host-level (Verified
-- Host, Premium Host). Full Trust & Safety tooling (fraud detection,
-- dispute handling) is Phase F — this phase is the badge/review data
-- model and the auto-computation, not a moderation queue.
-- ============================================================

CREATE TABLE IF NOT EXISTS stays_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL UNIQUE REFERENCES stays_bookings(id) ON DELETE CASCADE, -- one review per stay; UNIQUE enforces "verified stays only"
  property_id     UUID NOT NULL REFERENCES stays_properties(id) ON DELETE CASCADE,
  guest_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  cleanliness     SMALLINT NOT NULL CHECK (cleanliness BETWEEN 1 AND 5),
  comfort         SMALLINT NOT NULL CHECK (comfort BETWEEN 1 AND 5),
  location        SMALLINT NOT NULL CHECK (location BETWEEN 1 AND 5),
  communication   SMALLINT NOT NULL CHECK (communication BETWEEN 1 AND 5),
  value           SMALLINT NOT NULL CHECK (value BETWEEN 1 AND 5),
  amenities       SMALLINT NOT NULL CHECK (amenities BETWEEN 1 AND 5),
  overall_rating  NUMERIC(3,2) NOT NULL,   -- average of the six categories above, computed at insert

  comment         TEXT,
  host_reply      TEXT,
  host_replied_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stays_reviews_property ON stays_reviews(property_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stays_reviews_host ON stays_reviews(host_id);

-- Auto-computed rating rollup + admin/auto trust badges, read on every
-- property card/detail view. Recomputed after each review — see
-- recomputeStaysTrust() in staysTrustService.js — rather than
-- aggregated with a live COUNT/AVG query on every page view.
ALTER TABLE stays_properties ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2);
ALTER TABLE stays_properties ADD COLUMN IF NOT EXISTS reviews_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stays_properties ADD COLUMN IF NOT EXISTS manual_badges JSONB NOT NULL DEFAULT '[]';  -- admin-curated only (e.g. luxury_stay, family_friendly)
ALTER TABLE stays_properties ADD COLUMN IF NOT EXISTS trust_badges JSONB NOT NULL DEFAULT '[]';   -- cached union of auto-computed + manual_badges, recomputed on every change to either

-- One row per Stays host — the host-level counterpart to
-- business_profiles.verification_level (phase43), but scoped to Stays
-- since a host's hospitality trust signals (response rate, premium
-- tier) are distinct from their general marketplace business record.
CREATE TABLE IF NOT EXISTS stays_host_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avg_rating          NUMERIC(3,2),
  reviews_count       INTEGER NOT NULL DEFAULT 0,
  trust_badges        JSONB NOT NULL DEFAULT '[]',
  premium_tier        BOOLEAN NOT NULL DEFAULT FALSE,   -- admin-assigned "Premium Host"
  responsive_tier     BOOLEAN NOT NULL DEFAULT FALSE,   -- admin-assigned "Super Responsive" (real response-time tracking is a Phase F/chat-system enhancement)
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_stays_host_profiles_updated_at BEFORE UPDATE ON stays_host_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_review_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_review_reply';
