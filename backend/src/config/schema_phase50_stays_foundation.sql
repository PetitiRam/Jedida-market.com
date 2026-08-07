-- ============================================================
-- schema_phase50_stays_foundation.sql
-- Jedida Stays — Phase A (Foundation): property listings, media
-- gallery, availability calendar, seasonal/weekend/holiday pricing,
-- special offers.
--
-- Builds on the existing platform rather than duplicating it:
--   - role_upgrades / business_profiles (phase37)  -> a Property
--     Manager/Hotel/Agency/Tour Company/Corporate provider that wants
--     a company record gets one exactly like manufacturer/supplier/
--     farmer did; an Individual Owner just upgrades role with no
--     business_profiles row, same as a plain seller.
--   - media_uploads / POST /api/uploads (routes/uploads.js)  -> photo
--     and video files are uploaded through the existing generic
--     Cloudinary endpoint; stays_property_media stores the returned
--     URLs against a property instead of a second upload pipeline.
--   - listing_status (phase2)  -> reused as-is for property status
--     (draft/pending_review/active/paused/rejected); no new enum.
--   - notifications / notification_type (phase2)  -> reused for
--     property approval/rejection, no second notifications table.
--   - account_status (phase37)  -> reused for stays_property_verification.
--
-- Deliberately NOT built here (later phases):
--   - Booking engine / payments / escrow                -> Phase B
--   - Digital Stay Pass (QR, expiry, sharing)            -> Phase C
--   - Host/Guest dashboards are frontend-only in phase A -> Phase D
--   - Trust Engine badges specific to Stays, reviews      -> Phase E
--   - Property Operations Division admin roles, staff,
--     fraud/dispute handling, deep verification workflow  -> Phase F
--   - AI description/pricing/guest-Q&A assistance         -> Phase G
--   - Analytics dashboards, PMS/hotel-system APIs         -> Phase H
-- ============================================================

ALTER TABLE role_upgrades DROP CONSTRAINT IF EXISTS role_upgrades_requested_role_check;
ALTER TABLE role_upgrades ADD CONSTRAINT role_upgrades_requested_role_check
  CHECK (requested_role IN ('seller', 'delivery', 'manufacturer', 'supplier', 'dropshipper', 'farmer', 'host'));

-- ------------------------------------------------------------
-- Property-owner type and property type. Kept as their own enums
-- (not folded into business_type/product_category) since they
-- describe the listing, not the account.
-- ------------------------------------------------------------
CREATE TYPE stays_owner_type AS ENUM (
  'individual', 'property_manager', 'hotel', 'hospitality_company',
  'property_agency', 'tour_company', 'corporate_provider'
);

CREATE TYPE stays_property_type AS ENUM (
  'serviced_apartment', 'holiday_home', 'guest_house', 'hotel', 'resort',
  'safari_lodge', 'luxury_villa', 'private_villa', 'beach_house', 'farm_stay',
  'cabin', 'cottage', 'student_holiday_accommodation', 'conference_accommodation',
  'executive_suite', 'camping_site', 'tiny_house', 'tree_house', 'glamping_site',
  'corporate_housing'
);

CREATE TYPE stays_media_type AS ENUM ('photo', 'video', 'virtual_tour');
CREATE TYPE stays_pricing_type AS ENUM ('seasonal', 'weekend', 'holiday');

-- ------------------------------------------------------------
-- PROPERTIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stays_properties (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_profile_id   UUID REFERENCES business_profiles(id) ON DELETE SET NULL, -- NULL for individual owners

  owner_type            stays_owner_type NOT NULL DEFAULT 'individual',
  property_type         stays_property_type NOT NULL,

  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  highlights            JSONB NOT NULL DEFAULT '[]',   -- ["Ocean view","Private pool"]
  amenities             JSONB NOT NULL DEFAULT '[]',   -- ["WiFi","Pool","Parking",...]
  house_rules           TEXT,

  max_guests            INTEGER NOT NULL DEFAULT 1,
  bedrooms              INTEGER NOT NULL DEFAULT 0,
  bathrooms             INTEGER NOT NULL DEFAULT 0,
  beds                  INTEGER NOT NULL DEFAULT 1,
  kitchen_details       TEXT,
  internet_mbps         INTEGER,
  parking               JSONB NOT NULL DEFAULT '{}',   -- {"available":true,"type":"On-site","fee":0}
  accessibility_features JSONB NOT NULL DEFAULT '[]',
  nearby_attractions    JSONB NOT NULL DEFAULT '[]',   -- [{"name":"...","distance_km":1.2}]
  languages_spoken      TEXT[] DEFAULT '{}',
  emergency_contact_name  VARCHAR(255),
  emergency_contact_phone VARCHAR(32),

  address_line          VARCHAR(255),
  city                  VARCHAR(120),
  country               VARCHAR(120),
  latitude              NUMERIC(9,6),
  longitude             NUMERIC(9,6),

  check_in_time         TIME NOT NULL DEFAULT '14:00',
  check_out_time        TIME NOT NULL DEFAULT '10:00',
  cancellation_policy    TEXT,

  base_price            NUMERIC(12,2) NOT NULL,
  currency              VARCHAR(10) NOT NULL DEFAULT 'USD',
  cleaning_fee          NUMERIC(12,2) NOT NULL DEFAULT 0,
  security_deposit      NUMERIC(12,2),

  status                listing_status NOT NULL DEFAULT 'pending_review',
  verification_status   account_status NOT NULL DEFAULT 'pending', -- deepened in Phase F
  reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  reviewer_notes        TEXT,

  -- AI processing hooks (Phase G wires the actual bot; columns land
  -- now so Phase G is additive, mirroring ai_polished on products).
  ai_polished           BOOLEAN NOT NULL DEFAULT FALSE,
  ai_polish_notes       TEXT,

  views_count           INTEGER NOT NULL DEFAULT 0,
  bookings_count         INTEGER NOT NULL DEFAULT 0,
  is_featured            BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (max_guests > 0),
  CHECK (base_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stays_properties_owner ON stays_properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_stays_properties_status ON stays_properties(status);
CREATE INDEX IF NOT EXISTS idx_stays_properties_type ON stays_properties(property_type);
CREATE INDEX IF NOT EXISTS idx_stays_properties_city ON stays_properties(city);

CREATE TRIGGER trg_stays_properties_updated_at BEFORE UPDATE ON stays_properties
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- MEDIA — photos, videos, optional 360 virtual tour. Files are
-- uploaded via the existing POST /api/uploads (Cloudinary) endpoint;
-- this table just links the returned URL to a property, an album,
-- and a sort position.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stays_property_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES stays_properties(id) ON DELETE CASCADE,
  media_type      stays_media_type NOT NULL DEFAULT 'photo',
  url             TEXT NOT NULL,
  thumbnail_url   TEXT,
  album           VARCHAR(100),              -- e.g. "Living Room", "Drone Footage"
  caption         VARCHAR(255),
  is_cover        BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  ai_quality_score SMALLINT CHECK (ai_quality_score BETWEEN 0 AND 100), -- reuses phase43 image-quality heuristic
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stays_media_property ON stays_property_media(property_id, sort_order);

-- Only one cover image per property.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stays_media_one_cover
  ON stays_property_media(property_id) WHERE is_cover;

-- ------------------------------------------------------------
-- AVAILABILITY — one row per property per calendar date. Sparse:
-- a date with no row is treated as available at base_price by the
-- controller, so a brand-new listing doesn't need millions of
-- pre-inserted rows. A row is written only when a host blocks a
-- date or overrides its price.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stays_availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES stays_properties(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  price_override  NUMERIC(12,2),
  min_stay_nights INTEGER NOT NULL DEFAULT 1,
  note            VARCHAR(255),               -- host-facing only, e.g. "Family reunion"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, date)
);

CREATE INDEX IF NOT EXISTS idx_stays_availability_property_date ON stays_availability(property_id, date);

CREATE TRIGGER trg_stays_availability_updated_at BEFORE UPDATE ON stays_availability
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- SEASONAL / WEEKEND / HOLIDAY PRICING RULES — date-range or
-- day-of-week rules layered under the sparse per-date overrides
-- above (a stays_availability row for a specific date always wins;
-- these rules fill in everything else). Kept separate from
-- stays_availability so a host can define "Christmas week +40%"
-- once instead of writing 7 individual date rows.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stays_pricing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES stays_properties(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,       -- "December Peak Season", "Weekend rate"
  pricing_type    stays_pricing_type NOT NULL,
  start_date      DATE,                        -- NULL for a recurring weekend rule
  end_date        DATE,
  days_of_week    SMALLINT[],                  -- 0=Sun..6=Sat, used for 'weekend' rules
  price           NUMERIC(12,2) NOT NULL,       -- absolute nightly price (not a % delta, for clarity)
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (price >= 0),
  CHECK (pricing_type <> 'weekend' OR days_of_week IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_stays_pricing_rules_property ON stays_pricing_rules(property_id, is_active);

CREATE TRIGGER trg_stays_pricing_rules_updated_at BEFORE UPDATE ON stays_pricing_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- SPECIAL OFFERS — simple % discount over a date range, surfaced on
-- the listing and applied by the (Phase B) booking engine.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stays_special_offers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID NOT NULL REFERENCES stays_properties(id) ON DELETE CASCADE,
  title             VARCHAR(120) NOT NULL,
  description       VARCHAR(255),
  discount_percent  SMALLINT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_stays_offers_property ON stays_special_offers(property_id, is_active);

-- ------------------------------------------------------------
-- Notifications reused from phase2 — add the two events this phase
-- generates (property approved/rejected). Booking/payment/stay-pass
-- notification types are added in their respective phases.
-- ------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_property_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_property_rejected';
