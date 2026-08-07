-- ============================================================
-- schema_phase37.sql
-- Foundation for the commerce-ecosystem expansion: three new
-- account types built on the existing seller/upgrade architecture —
-- Manufacturer, Supplier, Dropshipper. Purely additive: new enum
-- values, new nullable columns, new tables only. Nothing existing
-- is altered, dropped, or renamed, and the existing seller/delivery
-- upgrade flow keeps working exactly as it does today.
--
-- Design notes:
-- * These are new values on the same `user_role` enum `partner`
--   was added to in phase33 — same login/session/wallet machinery
--   everyone else already uses, not a parallel account system.
-- * They ride the *existing* role_upgrades state machine (request ->
--   payment -> verification -> admin approval) rather than a new
--   one, so upgradeController.js's transition rules, audit log
--   (role_upgrade_events), and the Admin Upgrade Panel keep working
--   unmodified for the parts that don't need role-specific data.
-- * The one thing sellers/delivery didn't need and these do is
--   *company* verification (registration docs) instead of, or in
--   addition to, personal KYC — so this file adds a business_profiles
--   / business_verification_documents pair that plugs into the same
--   "kyc_pending -> kyc_verified/kyc_rejected" stage of that state
--   machine (see upgradeController.js submitBusinessVerification).
-- ============================================================

-- ADD VALUE cannot run in the same transaction that references the
-- new value, so this file only adds enum values — nothing below
-- depends on them existing yet within this same migration run.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manufacturer';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supplier';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dropshipper';

-- ------------------------------------------------------------
-- role_upgrades.requested_role was CHECK-constrained to
-- ('seller','delivery') only. Widen it to the new roles without
-- touching any other column or existing row.
-- ------------------------------------------------------------
ALTER TABLE role_upgrades DROP CONSTRAINT IF EXISTS role_upgrades_requested_role_check;
ALTER TABLE role_upgrades ADD CONSTRAINT role_upgrades_requested_role_check
  CHECK (requested_role IN ('seller', 'delivery', 'manufacturer', 'supplier', 'dropshipper'));

-- ------------------------------------------------------------
-- BUSINESS PROFILES — the company-level record behind a
-- manufacturer/supplier/dropshipper account. One per approved (or
-- in-progress) upgrade request. Reuses account_status (the same
-- pending/active/suspended/rejected lifecycle shops already use)
-- rather than inventing a parallel status enum.
-- ------------------------------------------------------------
CREATE TYPE business_type AS ENUM ('manufacturer', 'supplier', 'dropshipper');

CREATE TABLE IF NOT EXISTS business_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upgrade_id            UUID NOT NULL REFERENCES role_upgrades(id) ON DELETE CASCADE,
  business_type         business_type NOT NULL,

  company_name          VARCHAR(255) NOT NULL,
  registration_number   VARCHAR(120),          -- required for manufacturer/supplier, optional for dropshipper
  tax_id                VARCHAR(120),
  company_country       VARCHAR(100),
  company_address       TEXT,
  business_email        VARCHAR(255),
  business_phone        VARCHAR(32),
  website               VARCHAR(255),
  description           TEXT,

  status                account_status NOT NULL DEFAULT 'pending',
  reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  reviewer_notes        TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (upgrade_id)
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_user ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_type_status ON business_profiles(business_type, status);

CREATE TRIGGER trg_business_profiles_updated_at BEFORE UPDATE ON business_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- BUSINESS VERIFICATION DOCUMENTS — company-level equivalent of
-- kyc_documents (which stays exactly as-is for personal ID checks
-- on seller/delivery accounts). Manufacturer/supplier require at
-- least one document before their profile can be verified;
-- dropshipper does not (mirrors delivery's lighter bar in
-- upgradeController.requiredStatusForApproval).
-- ------------------------------------------------------------
CREATE TYPE business_document_type AS ENUM (
  'business_license', 'certificate_of_incorporation', 'tax_registration', 'other'
);

CREATE TABLE IF NOT EXISTS business_verification_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  doc_type            business_document_type NOT NULL,
  file_name           VARCHAR(255),
  file_url            TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_verification_documents_profile
  ON business_verification_documents(business_profile_id);

-- ------------------------------------------------------------
-- ROLE PERMISSIONS — lets Admin restrict what a specific approved
-- business account can do beyond the baseline for its role (e.g.
-- temporarily disable bulk import for one supplier without
-- suspending the whole account). Additive to, not a replacement
-- for, primary_role — most accounts will simply have no rows here
-- and fall back to the default permission set for their role.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission    VARCHAR(60) NOT NULL, -- e.g. 'bulk_import', 'wholesale_pricing', 'storefront_publish'
  allowed       BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_user ON role_permissions(user_id);
