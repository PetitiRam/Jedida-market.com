-- ============================================================
-- schema_phase41_b2b_wholesale.sql
-- Manufacturer & Supplier wholesale storefront layer — Stage 1 of the
-- B2B extension requested on top of schema_phase37 (roles/verification)
-- and schema_phase38 (business-to-business sourcing/import). Purely
-- additive: new nullable columns, new tables, new enum values only.
-- Nothing existing is altered, dropped, or renamed.
--
-- Design notes:
-- * schema_phase37 already gives manufacturer/supplier a company
--   record (business_profiles) and document upload
--   (business_verification_documents). This file adds the
--   factory/warehouse + capacity/stock fields those two roles need
--   on top of that same row, rather than a parallel profile table.
-- * schema_phase38 already lets a manufacturer/supplier mark a
--   product `is_sourceable` with a flat `wholesale_price`, for OTHER
--   VERIFIED BUSINESSES to source from. This file adds genuine
--   quantity-break tier pricing (product_wholesale_tiers) and
--   certificates (product_certificates), which apply to ANY buyer
--   viewing the public storefront, not just connected businesses.
-- * quote_requests is intentionally separate from
--   product_sourcing_requests (phase38): sourcing requests require an
--   accepted business_connection between two verified businesses;
--   quote_requests are the public "Request Quotation" a buyer sends
--   from a manufacturer/supplier's storefront with no connection
--   required, mirroring an Alibaba-style RFQ.
-- * Reuses the existing `minimum_order_quantity` column on products
--   (schema_phase7) as the bulk-only floor enforced at checkout (see
--   ordersController.js) — no new MOQ column.
-- ============================================================

-- ------------------------------------------------------------
-- Factory / warehouse + operating info on the existing company
-- record. Manufacturer uses factory_address + production_capacity;
-- supplier uses warehouse_address; stock_availability applies to
-- both. All nullable — a business simply hasn't filled them in yet
-- until it does, same convention as the rest of business_profiles.
-- ------------------------------------------------------------
CREATE TYPE stock_availability_status AS ENUM ('in_stock', 'limited_stock', 'made_to_order', 'out_of_stock');

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS factory_address TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS warehouse_address TEXT;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS production_capacity VARCHAR(255);
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS stock_availability stock_availability_status NOT NULL DEFAULT 'in_stock';

-- ------------------------------------------------------------
-- WHOLESALE PRICING TIERS — quantity-break discounts on a
-- manufacturer/supplier's own bulk listing (e.g. 100-499 units at
-- $4.20, 500+ at $3.80). max_quantity NULL means "and up". Purely
-- display/quote data today — checkout still bills at products.price;
-- tiers inform the quote a business sends back via quote_requests.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_wholesale_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_quantity    INTEGER NOT NULL CHECK (min_quantity > 0),
  max_quantity    INTEGER,                    -- NULL = no upper bound
  unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (max_quantity IS NULL OR max_quantity >= min_quantity)
);

CREATE INDEX IF NOT EXISTS idx_wholesale_tiers_product ON product_wholesale_tiers(product_id, min_quantity);

CREATE TRIGGER trg_wholesale_tiers_updated_at BEFORE UPDATE ON product_wholesale_tiers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- PRODUCT CERTIFICATES — compliance/quality documents attached to a
-- bulk listing (CE, ISO, food safety, etc.), shown on the public
-- storefront alongside the verification badge.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_certificates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  issuing_body    VARCHAR(255),
  file_url        TEXT NOT NULL,
  issued_at       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_certificates_product ON product_certificates(product_id);

-- ------------------------------------------------------------
-- QUOTE REQUESTS — the public "Request Quotation" flow from a
-- manufacturer/supplier storefront. Any buyer may open one; no
-- business_connection required (contrast with product_sourcing_requests
-- in phase38, which is business-to-business only).
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE quote_request_status AS ENUM ('pending', 'quoted', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SCHEMA-DRIFT FIX: quote_requests was already created by phase 17 for
-- commerceActionsController.js's simple "ask this seller for a quote" flow
-- (product_id, buyer_id, quantity, requested_quantity, target_price,
-- quoted_price, message, status TEXT, admin_notes, handled_by) — and phase
-- 17 always runs before this file, so the CREATE TABLE IF NOT EXISTS below
-- was a permanent no-op, exactly like the blocked_ips bug fixed in phase
-- 68. quoteController.js / bulkOrderController.js / b2bCatalogController.js
-- (the real B2B wholesale RFQ flow this phase built) have been hitting
-- "column business_id/shop_id/quantity_requested/... does not exist"
-- against the live table ever since. Reconciled below with idempotent
-- ALTERs + backfill instead of a second CREATE TABLE. The old phase-17
-- columns are kept (commerceActionsController.js still depends on them) —
-- so this one physical table currently serves two different quote flows
-- with two different column sets. That's a real design overlap worth
-- splitting into two tables in a future phase; not done here to avoid
-- touching commerceActionsController.js's behavior in a bug-fix pass.
CREATE TABLE IF NOT EXISTS quote_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  buyer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;
UPDATE quote_requests SET shop_id = p.shop_id FROM products p WHERE p.id = quote_requests.product_id AND quote_requests.shop_id IS NULL;
DELETE FROM quote_requests WHERE shop_id IS NULL; -- orphaned rows with no resolvable product/shop can't satisfy the NOT NULL below
ALTER TABLE quote_requests ALTER COLUMN shop_id SET NOT NULL;

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES users(id) ON DELETE CASCADE;
UPDATE quote_requests SET business_id = s.owner_id FROM shops s WHERE s.id = quote_requests.shop_id AND quote_requests.business_id IS NULL;
ALTER TABLE quote_requests ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quantity_requested INTEGER;
UPDATE quote_requests SET quantity_requested = GREATEST(1, COALESCE(requested_quantity, quantity, 1)) WHERE quantity_requested IS NULL;
ALTER TABLE quote_requests ALTER COLUMN quantity_requested SET NOT NULL;
ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_quantity_requested_check CHECK (quantity_requested > 0);

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_unit_price NUMERIC(12,2);
UPDATE quote_requests SET quoted_unit_price = quoted_price WHERE quoted_unit_price IS NULL;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_notes TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS resulting_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- The existing `status` is free-text VARCHAR(20) from phase 17
-- (commerceActionsController.js writes plain strings there). Move it onto
-- the enum only when every existing value already fits it, so an
-- unexpected legacy status value fails loudly here rather than silently
-- truncating/erroring for both controllers at request time.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quote_requests' AND column_name = 'status' AND data_type <> 'USER-DEFINED')
     AND NOT EXISTS (SELECT 1 FROM quote_requests WHERE status NOT IN ('pending','quoted','accepted','declined','expired')) THEN
    ALTER TABLE quote_requests ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE quote_requests ALTER COLUMN status TYPE quote_request_status USING status::quote_request_status;
    ALTER TABLE quote_requests ALTER COLUMN status SET DEFAULT 'pending';
  END IF;
END $$;
ALTER TABLE quote_requests ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_requests_buyer ON quote_requests(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_quote_requests_business ON quote_requests(business_id, status);
CREATE INDEX IF NOT EXISTS idx_quote_requests_shop ON quote_requests(shop_id);

DROP TRIGGER IF EXISTS trg_quote_requests_updated_at ON quote_requests;
CREATE TRIGGER trg_quote_requests_updated_at BEFORE UPDATE ON quote_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reuses the existing notifications table/infrastructure (schema_phase2).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'quote_request_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'quote_request_updated';
