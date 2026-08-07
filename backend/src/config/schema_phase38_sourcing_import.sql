-- ============================================================
-- schema_phase38_sourcing_import.sql
-- Product Sourcing + Import System — the supply chain link between
-- Manufacturer/Supplier catalogs and Seller/Dropshipper storefronts
-- (see schema_phase37 for the roles themselves). Purely additive:
-- new nullable columns on `products`, new tables only. Nothing
-- existing is altered, dropped, or renamed.
--
-- Design notes:
-- * A manufacturer/supplier's wholesale catalog is just rows in the
--   *existing* `products` table (their shop's listings) with a few
--   new nullable columns switched on — not a parallel catalog system.
-- * "Importing" a product creates a normal new `products` row owned
--   by the importer's own shop (so it renders through every existing
--   storefront/browse/order code path unmodified) and links the two
--   via `product_imports`, which is also where markup/margin and
--   sync state live.
-- * Two businesses must be in an accepted `business_connections` row
--   before sourcing/importing is allowed between them — mirrors the
--   "Retailer/Supplier/Manufacturer relationships" requirement.
-- ============================================================

-- ------------------------------------------------------------
-- Wholesale-catalog fields on products. Only meaningful for a
-- manufacturer/supplier shop's own listings; a seller/dropshipper's
-- storefront listings simply leave these at their defaults. Reuses
-- the existing `minimum_order_quantity` column (schema_phase7) as the
-- wholesale MOQ rather than adding a near-duplicate column.
-- ------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_sourceable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_products_sourceable ON products(is_sourceable) WHERE is_sourceable = TRUE;

-- ------------------------------------------------------------
-- BUSINESS CONNECTIONS — a seller/dropshipper/supplier ("requester")
-- and a manufacturer/supplier ("partner") must accept a connection
-- before sourcing requests or imports can happen between them.
-- Symmetric on purpose: either side can be the one who initiated it.
-- ------------------------------------------------------------
CREATE TYPE business_connection_status AS ENUM ('pending', 'accepted', 'declined', 'revoked');

CREATE TABLE IF NOT EXISTS business_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          business_connection_status NOT NULL DEFAULT 'pending',
  message         TEXT,
  response_note   TEXT,
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> partner_id),
  UNIQUE (requester_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_business_connections_requester ON business_connections(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_business_connections_partner ON business_connections(partner_id, status);

CREATE TRIGGER trg_business_connections_updated_at BEFORE UPDATE ON business_connections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- PRODUCT SOURCING REQUESTS — a seller/dropshipper/supplier asking a
-- manufacturer/supplier for a specific product (existing catalog item
-- or a described need) at a given quantity, ahead of importing it.
-- ------------------------------------------------------------
CREATE TYPE sourcing_request_status AS ENUM ('pending', 'accepted', 'declined', 'fulfilled', 'cancelled');

CREATE TABLE IF NOT EXISTS product_sourcing_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_business_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_product_id   UUID REFERENCES products(id) ON DELETE SET NULL, -- NULL = a described need, not tied to an existing listing
  description         TEXT,
  quantity_requested  INTEGER NOT NULL DEFAULT 1,
  status              sourcing_request_status NOT NULL DEFAULT 'pending',
  response_note       TEXT,
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_requests_requester ON product_sourcing_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_sourcing_requests_target ON product_sourcing_requests(target_business_id, status);

CREATE TRIGGER trg_sourcing_requests_updated_at BEFORE UPDATE ON product_sourcing_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- PRODUCT IMPORTS — links an importer's own new listing back to the
-- manufacturer/supplier's source listing it was imported from, and
-- holds the markup rule + sync state used to keep price/stock/media
-- in step (see productImportSyncService.js).
-- ------------------------------------------------------------
CREATE TYPE import_margin_type AS ENUM ('percent', 'fixed');
CREATE TYPE product_import_status AS ENUM ('active', 'paused', 'removed');

CREATE TABLE IF NOT EXISTS product_imports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importer_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  importer_shop_id    UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  source_product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  imported_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  margin_type         import_margin_type NOT NULL DEFAULT 'percent',
  margin_value        NUMERIC(12,2) NOT NULL DEFAULT 0,
  sync_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at      TIMESTAMPTZ,
  status              product_import_status NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (imported_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_imports_importer ON product_imports(importer_id, status);
CREATE INDEX IF NOT EXISTS idx_product_imports_source ON product_imports(source_product_id);

CREATE TRIGGER trg_product_imports_updated_at BEFORE UPDATE ON product_imports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- Notification types for the sourcing/import workflow. Reuses the
-- existing notifications table/infrastructure (schema_phase2).
-- ------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'connection_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'connection_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'sourcing_request_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'sourcing_request_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'product_imported';
