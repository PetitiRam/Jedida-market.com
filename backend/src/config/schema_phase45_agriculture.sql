-- ============================================================
-- schema_phase45_agriculture.sql
-- Agriculture Marketplace upgrade. Builds on:
--   phase37 — Manufacturer/Supplier/Dropshipper roles, business_profiles,
--             verification, role_permissions
--   phase41 — B2B wholesale storefront: product_wholesale_tiers,
--             product_certificates, quote_requests
--   phase43 — quote_messages (negotiation), purchase_agreements (one-off
--             formal deal), disputes, fraud_flags, business_verification_level
--   phase44 — market_representatives / representative_assignments (human
--             reps, hard-capped in the DB from ever touching payments/
--             orders/ownership), ai_handler_subscriptions
--
-- This file adds exactly one new role (farmer) and exactly the
-- agriculture-specific facts nothing else covers: farm profiles
-- (production capacity / seasonal availability / harvest calendar /
-- farm-level certifications / reliability score), quality grade and
-- harvest date on a listing, and supply contracts (a *recurring*
-- purchase agreement — purchase_agreements in phase43 is a one-off
-- formal deal with a single resulting_order_id; this generates cycles).
--
-- Deliberately NOT added here, because it already exists:
--   - a second "quotation" table              -> quote_requests (phase41)
--     + quote_messages (phase43) for negotiation
--   - a second bulk-pricing-tier table         -> product_wholesale_tiers (phase41)
--   - a second product-certificate table       -> product_certificates (phase41)
--   - a second formal one-off agreement        -> purchase_agreements (phase43)
--   - a second dispute/fraud/admin-monitoring system -> disputes / fraud_flags (phase43)
--   - a second representative/agent account type -> market_representatives (phase44) —
--     a farm's rep is just a market_representatives row whose specialties
--     includes 'farmer'; no new admin_role needed
--   - a second factory/warehouse profile       -> business_profiles (phase37/41)
--     (farm_profiles below adds only what's genuinely agriculture-specific
--     on top of that same row)
--
-- Purely additive: new enum values, new nullable columns, new tables only.
-- ============================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'farmer';

ALTER TABLE role_upgrades DROP CONSTRAINT IF EXISTS role_upgrades_requested_role_check;
ALTER TABLE role_upgrades ADD CONSTRAINT role_upgrades_requested_role_check
  CHECK (requested_role IN ('seller', 'delivery', 'manufacturer', 'supplier', 'dropshipper', 'farmer'));

-- A farmer is a company-level record like manufacturer/supplier/dropshipper
-- (registration docs optional — many farms aren't incorporated; see
-- upgradeController.js BUSINESS_ROLES_REQUIRING_DOCS, which farmer is NOT
-- added to, same treatment as dropshipper).
ALTER TYPE business_type ADD VALUE IF NOT EXISTS 'farmer';

-- ------------------------------------------------------------
-- FARM PROFILES — one row per business_profiles.id (farmer, or a
-- supplier/manufacturer that also trades farm goods). Rides the same
-- verification lifecycle (business_profiles.status + phase43's
-- verification_level) instead of a second one.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farm_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id     UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,

  -- NOTE: production capacity is NOT duplicated here — business_profiles
  -- already has a production_capacity column (phase41, added for
  -- manufacturer) and farmer now shares that same B2B module/tab
  -- (b2bCatalogController.js B2B_ROLES), so farmers edit it there.
  seasonal_availability   JSONB NOT NULL DEFAULT '[]',  -- [{ "product": "Maize", "months": [1,2,11,12] }]
  harvest_calendar        JSONB NOT NULL DEFAULT '[]',  -- [{ "crop": "Maize", "plant_month": 3, "harvest_month": 8 }]
  certifications          JSONB NOT NULL DEFAULT '[]',  -- farm-level, e.g. [{ "name": "Organic", "issuer": "..." }]
                                                          -- (product_certificates in phase41 covers per-listing docs)

  -- Rolling reliability figure surfaced next to the trust score in chat/
  -- storefront headers. Recomputed by recomputeReliabilityScore() from
  -- completed vs disputed/cancelled orders — not hand-edited.
  supply_reliability_score SMALLINT CHECK (supply_reliability_score BETWEEN 0 AND 100),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (business_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_farm_profiles_business_profile ON farm_profiles(business_profile_id);

CREATE TRIGGER trg_farm_profiles_updated_at BEFORE UPDATE ON farm_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- Per-listing quality/harvest data. Nullable, so a normal (non-farm)
-- listing is completely unaffected. Quantity-break pricing already
-- exists via phase41's product_wholesale_tiers — not repeated here.
-- ------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS quality_grade VARCHAR(40);      -- e.g. "Grade A", "Export Grade"
ALTER TABLE products ADD COLUMN IF NOT EXISTS harvest_date DATE;

-- ------------------------------------------------------------
-- SUPPLY CONTRACTS — repeat-purchase agreements ("send me 5 tonnes of
-- maize every month for 6 months"). purchase_agreements (phase43) is a
-- one-off formal deal -> a single resulting_order_id; this generates
-- recurring cycles instead, and can optionally point back at the
-- purchase_agreement whose terms it was set up from.
-- ------------------------------------------------------------
CREATE TYPE supply_contract_status AS ENUM ('active', 'paused', 'completed', 'cancelled');
CREATE TYPE supply_contract_cycle AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly');

CREATE TABLE IF NOT EXISTS supply_contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id) ON DELETE SET NULL,
  originating_agreement_id UUID REFERENCES purchase_agreements(id) ON DELETE SET NULL,

  quantity_per_cycle    NUMERIC(12,2) NOT NULL,
  unit                  VARCHAR(30),
  cycle                 supply_contract_cycle NOT NULL DEFAULT 'monthly',
  unit_price            NUMERIC(12,2) NOT NULL,

  status                supply_contract_status NOT NULL DEFAULT 'active',
  next_delivery_date    DATE,
  starts_on             DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on               DATE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (buyer_id <> supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_supply_contracts_buyer ON supply_contracts(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_supply_contracts_supplier ON supply_contracts(supplier_id, status);

CREATE TRIGGER trg_supply_contracts_updated_at BEFORE UPDATE ON supply_contracts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- AGRICULTURE REPRESENTATIVES — NOT a new admin_role. A rep who
-- specializes in agriculture is simply a market_representatives row
-- (phase44) with 'farmer' in its specialties array, assigned to a
-- farmer/supplier business via representative_assignments exactly like
-- any other business. The hard DB ceiling in phase44
-- (chk_rep_cannot_touch_money) already guarantees a representative can
-- never receive payments, complete orders off-platform, or change
-- ownership — nothing agriculture-specific needs to be re-enforced here.
-- middleware/auth.js additionally denies admin_role='business_rep' on
-- the two supply_contracts write routes below, as defense in depth
-- against requireRole's blanket admin bypass.
-- ------------------------------------------------------------

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'supply_contract_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'supply_contract_updated';
