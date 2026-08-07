-- ============================================================
-- schema_phase42_dropshipper_network.sql
-- Stage 2 — Controlled Dropshipping Partnership System, built on top
-- of schema_phase37 (manufacturer/supplier/dropshipper roles) and
-- schema_phase38 (business_connections / sourcing). Purely additive:
-- new tables, new nullable columns, new enum values only. Nothing
-- existing is altered, dropped, or renamed.
--
-- Design notes:
-- * A dropshipper NEVER gets their own `products` row for a resold
--   item — that's the whole point of this being different from
--   schema_phase38's product_imports (which copies a listing into the
--   importer's own shop). Here the listing stays owned by the
--   manufacturer/supplier's shop for its entire life, so it keeps
--   flowing through the existing storefront/order/fulfillment code
--   paths unmodified, and "all transactions remain inside Jedida" is
--   automatic rather than something each endpoint has to enforce.
-- * dropship_partnerships is the account-level relationship (may I
--   resell from you at all, and in which regions); dropship_product_access
--   is the per-listing grant underneath it (which specific products,
--   at what reseller price, for what commission). A partnership can
--   be approved with zero product access rows yet — those are
--   requested/granted separately, per the brief's "Request partnership
--   access" -> "Accept supplier agreements" -> product-level flow.
-- * orders gains dropshipper linkage as nullable columns rather than a
--   parallel orders table, so confirmPayment/confirmDelivery in
--   ordersController.js keep working completely unmodified for
--   dropship sales — only order *creation* (reseller pricing +
--   commission calculation) and fund *release* (three-way split
--   instead of two-way) need dropship-aware code, in dropshipController.js.
-- * dropship_audit_log is a dedicated, append-only trail for this
--   feature specifically (distinct from partner_application_audit_log
--   and partner_portal_audit_log, which cover the unrelated Partner
--   Apps program) — every partnership/access/price/commission/order
--   action funnels through logDropshipAction() in the controller.
-- ============================================================

-- ------------------------------------------------------------
-- A manufacturer/supplier opts a specific listing into the dropship
-- network. Independent of is_sourceable (schema_phase38) — a product
-- can be sourceable (seller/dropshipper imports it as their own
-- listing), dropshippable (resold under the original listing, no
-- ownership transfer), both, or neither.
-- ------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_dropshippable BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_products_dropshippable ON products(is_dropshippable) WHERE is_dropshippable = TRUE;

-- ------------------------------------------------------------
-- DROPSHIP PARTNERSHIPS — the account-level relationship a
-- dropshipper requests with one manufacturer/supplier. Must be
-- 'approved' before any product-access request or resale can happen
-- between the two. allowed_regions NULL/empty = no region
-- restriction; otherwise a resale is only allowed when the buyer's
-- shipping destination matches one of these (see isRegionAllowed in
-- dropshipController.js).
-- ------------------------------------------------------------
CREATE TYPE dropship_partnership_status AS ENUM ('pending', 'approved', 'rejected', 'suspended', 'revoked');

CREATE TABLE IF NOT EXISTS dropship_partnerships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dropshipper_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- manufacturer/supplier
  status              dropship_partnership_status NOT NULL DEFAULT 'pending',
  request_message     TEXT,
  agreement_snapshot  TEXT,          -- the supplier's dropship terms/instructions the dropshipper accepted at request time
  response_note       TEXT,
  allowed_regions     TEXT[],        -- NULL/empty = unrestricted
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (dropshipper_id <> business_id),
  UNIQUE (dropshipper_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_dropship_partnerships_dropshipper ON dropship_partnerships(dropshipper_id, status);
CREATE INDEX IF NOT EXISTS idx_dropship_partnerships_business ON dropship_partnerships(business_id, status);

CREATE TRIGGER trg_dropship_partnerships_updated_at BEFORE UPDATE ON dropship_partnerships
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- DROPSHIP PRODUCT ACCESS — a specific listing granted to a specific
-- approved partnership. reseller_price/commission are set by the
-- manufacturer/supplier at approval time (the brief: "Set reseller
-- prices" / "Set commission percentages" are *their* controls, not
-- the dropshipper's). region_override, when set, replaces (not adds
-- to) the partnership's allowed_regions for this one product.
-- ------------------------------------------------------------
CREATE TYPE dropship_access_status AS ENUM ('pending', 'active', 'paused', 'rejected', 'revoked');
CREATE TYPE dropship_commission_type AS ENUM ('percent', 'fixed');

CREATE TABLE IF NOT EXISTS dropship_product_access (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id      UUID NOT NULL REFERENCES dropship_partnerships(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status              dropship_access_status NOT NULL DEFAULT 'pending',
  reseller_price      NUMERIC(12,2) CHECK (reseller_price IS NULL OR reseller_price >= 0),
  commission_type     dropship_commission_type NOT NULL DEFAULT 'percent',
  commission_value    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  region_override      TEXT[],
  request_note        TEXT,
  response_note        TEXT,
  granted_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partnership_id, product_id),
  CHECK (commission_type <> 'percent' OR commission_value <= 100)
);

CREATE INDEX IF NOT EXISTS idx_dropship_access_partnership ON dropship_product_access(partnership_id, status);
CREATE INDEX IF NOT EXISTS idx_dropship_access_product ON dropship_product_access(product_id);

CREATE TRIGGER trg_dropship_access_updated_at BEFORE UPDATE ON dropship_product_access
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- MARKETING MATERIALS — images/video/copy a manufacturer/supplier
-- provides for a dropshippable listing, on top of the product's own
-- images (schema_phase7). Visible to any dropshipper with active
-- access to that product.
-- ------------------------------------------------------------
CREATE TYPE dropship_asset_type AS ENUM ('image', 'video', 'description_copy', 'banner', 'other');

CREATE TABLE IF NOT EXISTS dropship_marketing_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asset_type      dropship_asset_type NOT NULL,
  url             TEXT,           -- for image/video/banner
  content         TEXT,           -- for description_copy
  caption         VARCHAR(255),
  uploaded_by     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dropship_assets_product ON dropship_marketing_assets(product_id);

-- ------------------------------------------------------------
-- DROPSHIP LINKAGE ON ORDERS — an order placed against a dropshipper's
-- resale link. shop_id/product_id (existing columns) still point at
-- the manufacturer/supplier's own listing, so fulfillment renders
-- through every existing Orders/Delivery screen unmodified; these new
-- columns are only what's needed to compute and later release the
-- dropshipper's commission on top of the normal seller payout.
-- ------------------------------------------------------------
CREATE TYPE dropship_commission_status AS ENUM ('pending', 'released', 'reversed');

ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropshipper_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropship_partnership_id UUID REFERENCES dropship_partnerships(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropship_access_id UUID REFERENCES dropship_product_access(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_status dropship_commission_status;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_released_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_dropshipper ON orders(dropshipper_id) WHERE dropshipper_id IS NOT NULL;

-- ------------------------------------------------------------
-- PERFORMANCE / SCORE — rolling stats on the dropshipper's own
-- business_profiles row (business_type = 'dropshipper'), updated
-- transactionally whenever a dropship order completes or its
-- commission is released/reversed. performance_score is a simple
-- 0-100 figure (fulfillment-neutral — it's driven only by things the
-- dropshipper controls: completed sales vs. cancelled/reversed ones)
-- recomputed alongside the counters, not a separate cron job.
-- ------------------------------------------------------------
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS dropship_total_orders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS dropship_completed_orders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS dropship_reversed_orders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS dropship_total_sales_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS dropship_total_commission_earned NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS dropship_performance_score NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS dropship_last_sale_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- AUDIT LOG — every partnership request/approval, product-access
-- grant/rejection, price/commission change, order, and commission
-- payment funnels through here (see logDropshipAction in
-- dropshipController.js). Append-only: no update/delete endpoint is
-- ever exposed on this table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dropship_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role    VARCHAR(30),
  action        VARCHAR(60) NOT NULL, -- e.g. 'partnership_requested', 'product_access_approved', 'commission_changed', 'order_placed', 'commission_released'
  entity_type   VARCHAR(40) NOT NULL, -- 'partnership' | 'product_access' | 'order' | 'marketing_asset'
  entity_id     UUID,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dropship_audit_entity ON dropship_audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dropship_audit_actor ON dropship_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dropship_audit_action ON dropship_audit_log(action, created_at DESC);

-- ------------------------------------------------------------
-- Notifications — reuses the existing notifications infrastructure
-- (schema_phase2).
-- ------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dropship_partnership_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dropship_partnership_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dropship_access_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dropship_access_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dropship_order_placed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dropship_commission_released';
