-- ============================================================
-- schema_phase62_growth_benefits.sql
-- Verified Shop System — Phase E: Growth Benefits
-- Builds on schema_phase59/60/61 (trust engine, AI protection, shop feed).
-- Purely additive: one new table. Nothing existing is altered or dropped.
--
-- Priority search ranking (browseProducts / listAllShops ordering) and the
-- advanced analytics dashboard / AI Sales Growth Manager are computed live
-- from data that already exists (shop_trust_metrics, orders, products,
-- shop_feed_posts) — no new tables needed for those. This table exists
-- only to log the two self-serve promotional actions the Growth Hub adds
-- (discount campaigns, Shop Feed promo posts) so sellers see a "recent
-- activity" history and admins can monitor Growth Hub usage.
-- ============================================================

CREATE TYPE growth_action_type AS ENUM ('discount_campaign', 'promo_post');

CREATE TABLE IF NOT EXISTS shop_growth_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  action_type   growth_action_type NOT NULL,
  -- coupon id for discount_campaign, shop_feed_posts id for promo_post
  reference_id  UUID,
  details       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_growth_actions_shop ON shop_growth_actions(shop_id, created_at DESC);
