-- ============================================================
-- schema_phase24_partner_applications.sql
-- Phase 1 of the JEDIDA Partner Program: "Partner With Jedida"
-- application intake. Purely additive — new types/tables/indexes
-- only. Nothing existing is altered, dropped, or renamed.
-- ============================================================

CREATE TYPE partner_type AS ENUM (
  'payment_provider', 'delivery_company', 'technology_company', 'erp_provider',
  'pos_provider', 'ai_provider', 'financial_institution', 'government_agency',
  'marketing_platform', 'other'
);

CREATE TYPE partner_application_status AS ENUM (
  'pending', 'under_review', 'approved', 'rejected'
);

CREATE TYPE partner_document_type AS ENUM (
  'certificate_of_incorporation', 'business_license', 'company_profile',
  'tax_registration', 'other'
);

CREATE TABLE partner_applications (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code              VARCHAR(20) NOT NULL UNIQUE,

  -- Company
  company_name                VARCHAR(255) NOT NULL,
  registration_number         VARCHAR(120) NOT NULL,
  business_email               VARCHAR(255) NOT NULL,
  business_phone              VARCHAR(30) NOT NULL,
  website                     VARCHAR(255),
  country                     VARCHAR(100) NOT NULL,
  physical_address            TEXT NOT NULL,

  -- Contact person
  contact_full_name           VARCHAR(255) NOT NULL,
  contact_position             VARCHAR(150) NOT NULL,
  contact_email                VARCHAR(255) NOT NULL,
  contact_phone                VARCHAR(30) NOT NULL,

  -- Partnership
  partner_type                partner_type NOT NULL,
  partnership_reason          TEXT NOT NULL,
  services_provided           TEXT NOT NULL,
  expected_benefits           TEXT NOT NULL,

  -- Terms acceptance (all required at submission time)
  accepted_partnership_terms       BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_privacy_policy          BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_data_protection_policy  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Review lifecycle
  status                       partner_application_status NOT NULL DEFAULT 'pending',
  review_notes                 TEXT,
  reviewed_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at                  TIMESTAMPTZ,

  submitted_ip                 VARCHAR(64),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_applications_status ON partner_applications(status, created_at DESC);
CREATE INDEX idx_partner_applications_email ON partner_applications(business_email);

CREATE TRIGGER trg_partner_applications_updated_at BEFORE UPDATE ON partner_applications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE partner_application_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  doc_type        partner_document_type NOT NULL,
  file_name       VARCHAR(255) NOT NULL,
  file_url        TEXT NOT NULL,
  bytes           INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_application_documents_app ON partner_application_documents(application_id);
