-- Phase 67: Marketplace Builder — the visual, drag-and-drop CMS that
-- controls what appears on the Jedida-Market homepage (order, visibility,
-- schedule, layout, and manually-curated products/shops/categories per
-- section), plus the audit trail + on/off switches for the Tausi AI
-- automation layer that keeps it fresh. No hardcoded homepage content:
-- every row here either points at a live query (source_type='query') or
-- an explicit, admin/AI-curated attachment list.

-- One row per homepage rail/section. The six built-in rails that
-- homeController.js already computes live (nearby/featured/trending/new/
-- deals/recommended) plus featured shops are seeded below as is_system
-- rows with source_type='query' so the Marketplace Builder can reorder,
-- hide, schedule, or relayout them without touching their live query
-- logic. Admins can add further section_kind='products'|'shops' rows
-- with source_type='manual' (hand-picked or AI-curated attachments) or
-- 'category' (auto-pulls a category's live top products), and
-- section_kind='categories' rows for a curated category spotlight grid.
CREATE TABLE IF NOT EXISTS marketplace_sections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key    VARCHAR(80) NOT NULL UNIQUE,
  title          VARCHAR(150) NOT NULL,
  subtitle       TEXT,
  section_kind   VARCHAR(20) NOT NULL DEFAULT 'products'
                   CHECK (section_kind IN ('products', 'shops', 'categories')),
  source_type    VARCHAR(20) NOT NULL DEFAULT 'manual'
                   CHECK (source_type IN ('query', 'manual', 'category')),
  query_type     VARCHAR(30),   -- when source_type='query': nearby|featured|trending|new|deals|recommended|shops_featured
  filter_category VARCHAR(60),  -- when source_type='category'
  layout         VARCHAR(20) NOT NULL DEFAULT 'rail' CHECK (layout IN ('rail', 'grid')),
  position       INTEGER NOT NULL DEFAULT 0,
  is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  is_system      BOOLEAN NOT NULL DEFAULT FALSE, -- built-in rails can be hidden/reordered but not deleted
  ai_managed     BOOLEAN NOT NULL DEFAULT FALSE, -- Tausi may auto-curate this section's attachments
  max_items      INTEGER NOT NULL DEFAULT 12,
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_sections_position ON marketplace_sections(position);
CREATE INDEX IF NOT EXISTS idx_marketplace_sections_enabled ON marketplace_sections(is_enabled);

-- Manually/AI-attached products for source_type='manual' product sections.
CREATE TABLE IF NOT EXISTS marketplace_section_products (
  section_id  UUID NOT NULL REFERENCES marketplace_sections(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  added_by    VARCHAR(10) NOT NULL DEFAULT 'admin' CHECK (added_by IN ('admin', 'ai')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_section_products_section ON marketplace_section_products(section_id, position);

-- Manually/AI-attached shops for source_type='manual' shop sections.
CREATE TABLE IF NOT EXISTS marketplace_section_shops (
  section_id  UUID NOT NULL REFERENCES marketplace_sections(id) ON DELETE CASCADE,
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  added_by    VARCHAR(10) NOT NULL DEFAULT 'admin' CHECK (added_by IN ('admin', 'ai')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, shop_id)
);
CREATE INDEX IF NOT EXISTS idx_mkt_section_shops_section ON marketplace_section_shops(section_id, position);

-- Curated category spotlights for section_kind='categories' sections
-- (distinct from the always-live full category row/sidebar).
CREATE TABLE IF NOT EXISTS marketplace_section_categories (
  section_id  UUID NOT NULL REFERENCES marketplace_sections(id) ON DELETE CASCADE,
  category    VARCHAR(60) NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, category)
);

-- Audit trail for every Tausi marketplace-automation action, and a queue
-- for suggestions that need a human decision (promotions, seasonal
-- campaigns) rather than being auto-applied.
CREATE TABLE IF NOT EXISTS tausi_marketplace_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  behavior    VARCHAR(40) NOT NULL,
  target_type VARCHAR(30),
  target_id   UUID,
  summary     TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  status      VARCHAR(20) NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'suggested', 'dismissed', 'accepted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tausi_mkt_actions_behavior ON tausi_marketplace_actions(behavior, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tausi_mkt_actions_status ON tausi_marketplace_actions(status);

-- Per-behavior on/off switch + last-run bookkeeping, one row per behavior.
CREATE TABLE IF NOT EXISTS tausi_marketplace_settings (
  behavior     VARCHAR(40) PRIMARY KEY,
  is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at  TIMESTAMPTZ
);
INSERT INTO tausi_marketplace_settings (behavior) VALUES
  ('choose_best_products'), ('replace_low_performers'), ('detect_outdated_banners'),
  ('rotate_featured_products'), ('refresh_category_images'), ('recommend_promotions'),
  ('suggest_seasonal_campaigns')
ON CONFLICT (behavior) DO NOTHING;

-- Small live-image cache the refresh_category_images behavior compares
-- against, so it can report what actually changed rather than just
-- re-running the always-live query with nothing to say.
CREATE TABLE IF NOT EXISTS category_image_snapshot (
  category    VARCHAR(60) PRIMARY KEY,
  image_url   TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the existing live homepage rails as system sections so the
-- Marketplace Builder has something real to reorder/hide/schedule from
-- day one — this changes nothing about how the homepage looks until an
-- admin edits one of these rows.
INSERT INTO marketplace_sections (section_key, title, subtitle, section_kind, source_type, query_type, layout, position, is_system, max_items)
VALUES
  ('nearby',      'Near You',              'Listings from sellers closest to your current location.', 'products', 'query', 'nearby',        'rail', 10, TRUE, 12),
  ('featured',    'Featured Products',     'Hand-picked listings currently featured across the marketplace.', 'products', 'query', 'featured',      'rail', 20, TRUE, 12),
  ('trending',    'Trending Products',     'What''s trending across the marketplace right now.', 'products', 'query', 'trending',      'rail', 30, TRUE, 12),
  ('new',         'New Arrivals',          'The newest listings added to the marketplace.', 'products', 'query', 'new',           'rail', 40, TRUE, 12),
  ('deals',       'Flash Deals',           'Every active listing currently discounted below its original price.', 'products', 'query', 'deals',         'rail', 5,  TRUE, 12),
  ('recommended', 'Recommended For You',   'Popular picks based on orders and views across the marketplace.', 'products', 'query', 'recommended',   'rail', 50, TRUE, 12),
  ('shops_featured', 'Featured Shops',     'Top-rated shops across the marketplace.', 'shops', 'query', 'shops_featured', 'rail', 60, TRUE, 8)
ON CONFLICT (section_key) DO NOTHING;
