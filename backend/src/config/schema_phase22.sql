-- JEDIDA Marketplace — Phase 22 schema
-- Upgrades the Ads system so the redesigned homepage can pull dynamic,
-- placement-aware promotional content (hero banners, deal strips, sidebar
-- spots) with scheduling, priority ordering, and click/impression tracking —
-- instead of a single flat rotating list.

DO $$ BEGIN
  CREATE TYPE ad_placement AS ENUM ('hero', 'deals', 'sidebar', 'category', 'header_strip');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE ads ADD COLUMN IF NOT EXISTS subtitle          TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS cta_text           VARCHAR(100);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS badge_text         VARCHAR(50);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS placement          ad_placement NOT NULL DEFAULT 'hero';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS priority           INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS starts_at          TIMESTAMPTZ;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS ends_at            TIMESTAMPTZ;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS target_category    VARCHAR(100);
ALTER TABLE ads ADD COLUMN IF NOT EXISTS clicks_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS impressions_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ads_placement_active ON ads(placement, active, priority DESC);

-- Keep updated_at current on edit (reuses the shared trigger fn defined in schema.sql)
DO $$ BEGIN
  CREATE TRIGGER trg_ads_updated_at BEFORE UPDATE ON ads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
