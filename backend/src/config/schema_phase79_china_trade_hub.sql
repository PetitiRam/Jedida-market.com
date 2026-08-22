-- ============================================================
-- schema_phase79_china_trade_hub.sql
-- China Trade Hub foundation: the supplier-side trade/factory data that
-- doesn't exist yet on business_profiles (phase37), plus two real
-- verification workflows — Factory Verification and Product Inspection
-- — and the "Jedida Africa Ready" trust badge that factory verification
-- feeds into. Purely additive.
--
-- Design notes:
-- * supplier_trade_capabilities is a 1:1 sibling table to
--   business_profiles rather than new columns bolted onto it, and adds
--   only the fields phase41 (factory_address/warehouse_address/
--   production_capacity/stock_availability) didn't already cover —
--   MOQ, lead time, OEM/ODM/private label, African markets served,
--   shipping port, certifications. No column is duplicated.
-- * factory_verification_reports and inspection_reports are real
--   findings records (business_existence_confirmed, defect counts,
--   etc.), not a decorative pass/fail flag — matching "This should be
--   a real verification status, not just a decorative badge."
-- * africa_ready_badges.criteria_met is JSONB listing exactly which
--   checks passed, mirroring the explainability requirement already
--   used for wanted_request_matches (schema_phase77) — a badge is only
--   ever awarded/revoked by an explicit admin action that records why,
--   never silently computed.
-- * inspection_requests links loosely to wanted_requests (phase77) and
--   orders via nullable FKs — an inspection can be requested against
--   either, or neither (a buyer just vetting a supplier before any
--   commitment).
-- ============================================================

CREATE TYPE verification_workflow_status AS ENUM (
  'requested', 'scheduled', 'in_progress', 'completed', 'cancelled'
);
CREATE TYPE verification_result AS ENUM ('passed', 'failed', 'needs_more_info');
CREATE TYPE inspection_result AS ENUM ('approved', 'rejected', 'conditional');

-- ------------------------------------------------------------
-- SUPPLIER TRADE CAPABILITIES — the China/Africa-trade-specific fields
-- section 6/24 ask for (MOQ, factory info, OEM/ODM, shipping port,
-- African markets served) that business_profiles has no room for.
-- ------------------------------------------------------------
-- Note: business_profiles already carries factory_address,
-- warehouse_address, production_capacity, and stock_availability
-- (phase41) — this table does NOT repeat those; it only adds the
-- China/Africa-trade fields phase41 didn't cover.
CREATE TABLE IF NOT EXISTS supplier_trade_capabilities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id    UUID NOT NULL UNIQUE REFERENCES business_profiles(id) ON DELETE CASCADE,

  moq                      INTEGER,
  lead_time_days           INTEGER,
  oem_available             BOOLEAN NOT NULL DEFAULT FALSE,
  odm_available             BOOLEAN NOT NULL DEFAULT FALSE,
  private_label_available   BOOLEAN NOT NULL DEFAULT FALSE,
  sample_available          BOOLEAN NOT NULL DEFAULT FALSE,
  packaging_customization   BOOLEAN NOT NULL DEFAULT FALSE,
  export_experience_years   INTEGER,
  african_markets_served    TEXT[] NOT NULL DEFAULT '{}',  -- country names
  shipping_port             VARCHAR(120),
  certifications            TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {'ISO9001','CE'}

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (moq IS NULL OR moq > 0),
  CHECK (lead_time_days IS NULL OR lead_time_days >= 0)
);

CREATE TRIGGER trg_supplier_trade_capabilities_updated_at BEFORE UPDATE ON supplier_trade_capabilities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- FACTORY VERIFICATION — a business (or admin, on its behalf) requests
-- Jedida verify the factory; an assigned verifier records real
-- findings.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS factory_verification_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id  UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  requested_by         UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  status               verification_workflow_status NOT NULL DEFAULT 'requested',
  assigned_verifier_id UUID REFERENCES users(id) ON DELETE SET NULL, -- an admin account
  scheduled_for        DATE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factory_verif_requests_profile ON factory_verification_requests(business_profile_id);
CREATE INDEX IF NOT EXISTS idx_factory_verif_requests_status ON factory_verification_requests(status);

CREATE TRIGGER trg_factory_verif_requests_updated_at BEFORE UPDATE ON factory_verification_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS factory_verification_reports (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id  UUID NOT NULL REFERENCES factory_verification_requests(id) ON DELETE CASCADE,
  verified_by               UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

  business_existence_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  factory_location_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  machinery_notes               TEXT,
  workforce_size                INTEGER,
  certifications_confirmed      TEXT[] NOT NULL DEFAULT '{}',
  product_samples_reviewed      BOOLEAN NOT NULL DEFAULT FALSE,
  export_history_notes          TEXT,
  photos                        JSONB NOT NULL DEFAULT '[]',

  overall_result             verification_result NOT NULL,
  summary                    TEXT,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factory_verif_reports_request ON factory_verification_reports(verification_request_id);

-- ------------------------------------------------------------
-- PRODUCT INSPECTION — buyer-requested, pre-shipment quality check.
-- Loosely linked to a Jedida Wanted request or an order (both
-- optional) so it also works standalone.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inspection_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- buyer
  business_profile_id  UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE, -- supplier being inspected
  wanted_request_id    UUID REFERENCES wanted_requests(id) ON DELETE SET NULL,
  order_id             UUID REFERENCES orders(id) ON DELETE SET NULL,

  product_description  TEXT NOT NULL,
  quantity              INTEGER,

  status                verification_workflow_status NOT NULL DEFAULT 'requested',
  assigned_inspector_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_for          DATE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (quantity IS NULL OR quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_inspection_requests_buyer ON inspection_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_inspection_requests_business ON inspection_requests(business_profile_id);
CREATE INDEX IF NOT EXISTS idx_inspection_requests_status ON inspection_requests(status);

CREATE TRIGGER trg_inspection_requests_updated_at BEFORE UPDATE ON inspection_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS inspection_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_request_id UUID NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
  inspector_id          UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

  quantity_inspected    INTEGER,
  quantity_passed       INTEGER,
  defect_notes          TEXT,
  photos                JSONB NOT NULL DEFAULT '[]',
  videos                JSONB NOT NULL DEFAULT '[]',

  result                inspection_result NOT NULL,
  summary               TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_request ON inspection_reports(inspection_request_id);

-- ------------------------------------------------------------
-- JEDIDA AFRICA READY — real, explainable trust badge. Only ever
-- awarded/revoked through an explicit admin action; never silently
-- computed by a background job, matching the trust-engine requirement
-- that scores/badges stay auditable.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS africa_ready_badges (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id  UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  awarded_by            UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  criteria_met          JSONB NOT NULL DEFAULT '[]', -- [{ criterion, detail }]
  awarded_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at             TIMESTAMPTZ,
  revoked_reason         TEXT,

  UNIQUE (business_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_africa_ready_active ON africa_ready_badges(business_profile_id) WHERE revoked_at IS NULL;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'factory_verification_completed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'inspection_report_ready';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'africa_ready_badge_awarded';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'africa_ready_badge_revoked';
