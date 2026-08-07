-- ============================================================
-- schema_phase60_ai_protection.sql
-- AI Protection for the Verified Shop system (Phase C). Deliberately
-- rule-based/statistical, not machine-learning — it sharpens the
-- deterministic signals Phase A's trust engine already produces and
-- gives admins a place to review what it flags. Reuses the existing
-- fraud_flags table for order-level detection (so flagged orders show
-- up in the admin Fraud & Disputes screen that already exists) and adds
-- a new shop_risk_signals table for the things fraud_flags doesn't fit
-- (follower/review/quality signals, which are shop-scoped, not user-
-- or order-scoped).
-- ============================================================

ALTER TYPE fraud_flag_type ADD VALUE IF NOT EXISTS 'suspicious_order_pattern';

-- ------------------------------------------------------------
-- Per-review AI flag — surfaced to admins, never auto-deletes a review.
-- ------------------------------------------------------------
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS ai_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS ai_flag_reason TEXT;
ALTER TABLE shop_reviews ADD COLUMN IF NOT EXISTS ai_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shop_reviews ADD COLUMN IF NOT EXISTS ai_flag_reason TEXT;

-- Per-follow suspicion cache, so an admin looking at a shop's follower
-- list can see exactly which follows tripped the heuristic (trust
-- engine only stores the aggregate count; this stores it per row).
ALTER TABLE shop_follows ADD COLUMN IF NOT EXISTS ai_suspicious BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------
-- SHOP RISK SIGNALS — admin-facing warnings for things that aren't a
-- single order or review: burst follower growth, review-bombing
-- patterns, and a verified shop's quality trending down.
-- ------------------------------------------------------------
CREATE TYPE shop_risk_signal_type AS ENUM ('fake_followers', 'fake_reviews', 'quality_decline');
CREATE TYPE shop_risk_signal_status AS ENUM ('open', 'acknowledged', 'dismissed');

CREATE TABLE IF NOT EXISTS shop_risk_signals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  signal_type  shop_risk_signal_type NOT NULL,
  severity     SMALLINT NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  details      JSONB NOT NULL DEFAULT '{}',
  status       shop_risk_signal_status NOT NULL DEFAULT 'open',
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_risk_signals_shop ON shop_risk_signals(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_risk_signals_open ON shop_risk_signals(status, severity DESC, created_at DESC);

-- New notification type for admin risk warnings.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shop_risk_signal_raised';

-- Admin-tunable AI Protection thresholds, same platform_settings JSONB
-- section pattern as verified_shop_settings.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ai_protection_settings JSONB NOT NULL DEFAULT '{
  "burstFollowThreshold": 50,
  "burstWindowHours": 24,
  "reviewBurstCount": 10,
  "reviewBurstWindowHours": 48,
  "orderVelocityMultiplier": 5,
  "fastCompletionMinutes": 10,
  "qualityDeclineTrustDrop": 15,
  "qualityDeclineFraudRiskThreshold": 40,
  "signalCooldownDays": 7
}'::jsonb;
