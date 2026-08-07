-- Phase 30: Index support for browseProducts (Phase 2 perf pass).
--
-- browseProducts filters on status (+ optional category) and sorts by
-- created_at DESC, but only single-column indexes existed on
-- (shop_id), (category), (status) individually — Postgres can use at most
-- one of those per scan, so a status+category+sort query still fell back
-- to scanning all active rows and sorting in memory. Composite indexes
-- let the common query shapes use a single index scan instead.
CREATE INDEX IF NOT EXISTS idx_products_status_created
  ON products(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_status_category_created
  ON products(status, category, created_at DESC);

-- Search (`ILIKE '%term%'`) can't use a plain btree index at all — every
-- search request was a full sequential scan over the products table. A
-- trigram GIN index lets Postgres use an index scan for ILIKE '%term%'
-- instead, which matters a lot once the catalog is more than a few
-- thousand rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON products USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING gin (brand gin_trgm_ops);
