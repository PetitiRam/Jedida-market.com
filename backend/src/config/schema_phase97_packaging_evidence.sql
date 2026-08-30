-- Phase 101: Packaging evidence.
--
-- No packaging-proof feature exists yet — this is new, not a redesign of
-- something that already worked. Images attach to a real order (via
-- order_id), reuse the same Cloudinary upload pipeline
-- (cloudinaryClient.js/uploadSecurity.js) every other upload on the
-- platform uses, and are visible to the buyer and admin automatically
-- because visibility is a query against order ownership, not a separate
-- "share with buyer" action a seller has to remember to take (spec #22:
-- "the seller should not have to separately send the images to the
-- buyer").

CREATE TYPE packaging_stage AS ENUM (
  'before_packaging', 'during_packaging', 'after_packaging'
);

-- Append-only, like financial_transactions — a seller can't silently
-- replace or delete evidence (spec #26). "Replacing" a photo is
-- superseding it: the old row's superseded_by is set, a new row is
-- inserted, and both remain queryable.
CREATE TABLE IF NOT EXISTS packaging_evidence (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shop_id           UUID NOT NULL REFERENCES shops(id),
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  stage             packaging_stage NOT NULL,
  image_url         VARCHAR(1000) NOT NULL,
  caption           VARCHAR(255),          -- e.g. "Product before packaging", "Sealed package"
  sequence_number   INTEGER NOT NULL DEFAULT 1, -- ordering within a stage, e.g. photo 2 of 5
  file_size_bytes   INTEGER,
  content_type      VARCHAR(100),
  ip_address        VARCHAR(64),
  superseded_by     UUID REFERENCES packaging_evidence(id),
  superseded_reason TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_packaging_evidence_order ON packaging_evidence(order_id, stage, sequence_number);
CREATE INDEX IF NOT EXISTS idx_packaging_evidence_shop ON packaging_evidence(shop_id, created_at DESC);

-- Per-order packaging status — where this order sits in the
-- Order received -> Packaging -> Packed -> Handed to logistics workflow
-- (spec #21). Deliberately separate from orders.status, which already
-- has its own broader lifecycle (pending_payment/paid_escrow/shipped/
-- completed/etc.) — packaging_status is a finer-grained view inside the
-- window where orders.status = 'paid_escrow', not a replacement for it.
CREATE TYPE packaging_status AS ENUM (
  'not_started', 'preparing', 'packaging', 'packed', 'handed_to_logistics'
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packaging_status packaging_status NOT NULL DEFAULT 'not_started';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packaging_marked_ready_at TIMESTAMPTZ;

-- Configurable evidence requirements by category (spec #24: "should
-- support configurable evidence requirements by product/category/order
-- type"). Kept minimal — a per-category minimum photo count for the
-- 'during_packaging' stage — rather than a full rules engine, since
-- nothing in the existing codebase has a rules-engine precedent to
-- extend and a bigger one isn't justified yet. category = '' is the
-- platform-wide default row (a plain string, not NULL, so the UNIQUE
-- constraint — which doesn't treat repeated NULLs as conflicts in
-- Postgres — actually prevents a second default row on migration re-run).
CREATE TABLE IF NOT EXISTS packaging_evidence_requirements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category               VARCHAR(100) NOT NULL UNIQUE DEFAULT '',
  min_during_packaging_photos INTEGER NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_packaging_requirements_updated_at BEFORE UPDATE ON packaging_evidence_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
INSERT INTO packaging_evidence_requirements (category, min_during_packaging_photos)
VALUES ('', 1) ON CONFLICT (category) DO NOTHING;
