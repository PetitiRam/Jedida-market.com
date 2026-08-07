-- Phase 48: Shop Builder — theme/layout picker, draft-and-publish block
-- layout editor, storefront analytics, AI Store Designer, and content
-- reports. shops.theme_primary_color / theme_accent_color already exist
-- (schema_phase16); this phase adds everything else shopBuilderController.js
-- and aiBusinessManager.js need.

ALTER TABLE shops ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'retail';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS layout_style VARCHAR(20) DEFAULT 'standard';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS font_family VARCHAR(50);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ai_designed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS blocks_published_at TIMESTAMPTZ;

-- Draft-and-publish storefront sections. The owner always sees every row;
-- only is_published = TRUE rows are meant to reach the public shop page.
CREATE TABLE IF NOT EXISTS shop_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  block_type    VARCHAR(50) NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  config        JSONB NOT NULL DEFAULT '{}',
  is_visible    BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_blocks_shop ON shop_blocks(shop_id, position);

-- Platform-level theme kill-switch (admin can disable a theme marketplace-wide).
CREATE TABLE IF NOT EXISTS shop_theme_availability (
  theme       VARCHAR(50) PRIMARY KEY,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Storefront visit / product-view tracking beacon that powers
-- getShopAnalytics() and getBusinessInsights().
CREATE TABLE IF NOT EXISTS shop_analytics_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  event_type   VARCHAR(30) NOT NULL,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  visitor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_analytics_events_shop ON shop_analytics_events(shop_id, event_type, created_at);

-- Abuse reports against a shop's custom Shop Builder content.
CREATE TABLE IF NOT EXISTS shop_content_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  block_id      UUID REFERENCES shop_blocks(id) ON DELETE SET NULL,
  reported_by   UUID NOT NULL REFERENCES users(id),
  reason        TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_content_reports_status ON shop_content_reports(status);
