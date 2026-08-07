-- ============================================================
-- schema_phase59_verified_shops.sql
-- Verified Shop System — replaces the old idea of shop "verification"
-- (which in this codebase only ever existed as (a) the manual admin-set
-- business_profiles.verification_level tier for manufacturer/supplier/
-- dropshipper accounts, and (b) a static specs.verified_supplier flag in
-- product JSONB that nothing ever actually computed) with a single
-- automatic, continuously-recomputed trust engine that applies to every
-- shop (retail seller, manufacturer, supplier, dropshipper, farmer).
--
-- business_profiles.verification_level is left untouched — it's a
-- separate B2B wholesale-trust concept (schema_phase43) that other
-- features (Stays trust badges, agricultureController, representative
-- portal) already read from. This phase does not remove or repurpose it.
--
-- Purely additive: new columns on shops, two new tables, one new
-- platform_settings JSONB column. Nothing existing is altered or dropped.
-- ============================================================

-- ------------------------------------------------------------
-- Badge + admin-override state, stored directly on the shop row so
-- every existing "SELECT s.* FROM shops s ..." across shopsController,
-- productsController, ordersController, etc. picks it up for free.
-- ------------------------------------------------------------
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verified_since TIMESTAMPTZ;

-- 'auto'                    — engine decides, the normal case
-- 'admin_forced_verified'   — admin grants the badge regardless of metrics
-- 'admin_forced_blocked'    — admin suspends/denies the badge regardless of metrics
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verification_mode VARCHAR(24) NOT NULL DEFAULT 'auto';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verification_override_reason TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verification_override_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS verification_override_at TIMESTAMPTZ;

ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_verification_mode_check;
ALTER TABLE shops ADD CONSTRAINT shops_verification_mode_check
  CHECK (verification_mode IN ('auto', 'admin_forced_verified', 'admin_forced_blocked'));

CREATE INDEX IF NOT EXISTS idx_shops_is_verified ON shops(is_verified);

-- ------------------------------------------------------------
-- SHOP TRUST METRICS — one row per shop, upserted every time the
-- engine recomputes (on a sweep timer, on-demand from the seller
-- dashboard, or an admin's "recompute now"). This is a cache of the
-- last computation, not raw data — trustEngineService.js is the only
-- writer.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_trust_metrics (
  shop_id                 UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,

  completed_orders_count  INTEGER NOT NULL DEFAULT 0,
  follower_count          INTEGER NOT NULL DEFAULT 0,
  suspicious_follower_count INTEGER NOT NULL DEFAULT 0,
  real_follower_count     INTEGER NOT NULL DEFAULT 0,

  reliability_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  delivery_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
  quality_score           NUMERIC(5,2) NOT NULL DEFAULT 0,
  satisfaction_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  response_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
  fraud_risk_score        NUMERIC(5,2) NOT NULL DEFAULT 0, -- 0 = clean, 100 = high risk
  trust_score             NUMERIC(5,2) NOT NULL DEFAULT 0,

  profile_complete        BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_complete            BOOLEAN NOT NULL DEFAULT FALSE,
  payment_verified        BOOLEAN NOT NULL DEFAULT FALSE,

  meets_orders_requirement    BOOLEAN NOT NULL DEFAULT FALSE,
  meets_followers_requirement BOOLEAN NOT NULL DEFAULT FALSE,
  meets_trust_requirement     BOOLEAN NOT NULL DEFAULT FALSE,
  meets_profile_requirement   BOOLEAN NOT NULL DEFAULT FALSE,
  eligible                    BOOLEAN NOT NULL DEFAULT FALSE,

  last_computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- SHOP VERIFICATION EVENTS — audit trail every time badge state
-- changes, whether the engine did it or an admin did. Powers both the
-- seller's "why did I lose my badge" view and the admin verification
-- metrics/history screen.
-- ------------------------------------------------------------
CREATE TYPE shop_verification_event_type AS ENUM (
  'granted', 'revoked', 'admin_override_verified', 'admin_override_blocked',
  'admin_override_cleared', 'admin_recompute'
);

CREATE TABLE IF NOT EXISTS shop_verification_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  event_type      shop_verification_event_type NOT NULL,
  reason          TEXT,
  actor_type      VARCHAR(10) NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'admin')),
  actor_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  metrics_snapshot JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_verification_events_shop ON shop_verification_events(shop_id, created_at DESC);

-- ------------------------------------------------------------
-- Admin-tunable thresholds, following the same platform_settings JSONB
-- section pattern as every other configurable area (see
-- settingsService.js SECTION_COLUMNS). Defaults match the brief exactly.
-- ------------------------------------------------------------
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS verified_shop_settings JSONB NOT NULL DEFAULT '{
  "minCompletedOrders": 500,
  "minFollowers": 1000,
  "minRealFollowerRatio": 0.7,
  "minTrustScore": 70,
  "weightReliability": 20,
  "weightDelivery": 20,
  "weightQuality": 20,
  "weightSatisfaction": 20,
  "weightResponseSpeed": 10,
  "weightFraudRisk": 10,
  "recomputeIntervalMinutes": 360,
  "autoRevokeEnabled": true
}'::jsonb;

-- New notification types for badge grants/revokes and admin overrides.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shop_verified';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shop_verification_revoked';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shop_verification_override_changed';
