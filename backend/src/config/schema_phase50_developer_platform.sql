-- ============================================================================
-- PHASE 50 — Developer & Partner Ecosystem (foundation)
-- ------------------------------------------------------------------------
-- This is the first of several phases behind the hidden Developer Mode
-- (12-tap logo gesture, see frontend hooks/useSecretTapGesture.js). It adds:
--   - developer profiles (any existing user can apply to become one)
--   - developer organizations + team membership/roles
--   - the read-only API catalog that the Developer Dashboard's API Centre
--     and API Explorer are seeded from
--   - agreement acceptance records (Developer Agreement, Marketplace
--     Policies, API Terms, Privacy Policy)
--
-- Deliberately NOT in this phase (each is its own later phase — see the
-- roadmap in the PR description): API keys/OAuth apps/sandbox (phase 51),
-- App Builder + Marketplace listings (phase 52), publishing workflow +
-- fees (phase 53), monetization/finance/payouts (phase 54), webhooks +
-- events (phase 55), Developer Trust Engine badges (phase 56).
-- Approval never happens automatically anywhere in this phase — every
-- developer and organization starts 'pending' and needs an admin with the
-- 'developer_platform' permission area to approve it.
-- ============================================================================

CREATE TYPE developer_category AS ENUM (
  'independent_developer',
  'freelancer',
  'startup',
  'software_company',
  'enterprise',
  'technology_partner',
  'integration_partner',
  'educational_institution',
  'research_organization',
  'official_jedida_team'
);

CREATE TYPE developer_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');

CREATE TYPE developer_org_role AS ENUM (
  'owner', 'administrator', 'project_manager', 'backend_developer', 'frontend_developer',
  'mobile_developer', 'ai_engineer', 'devops_engineer', 'security_engineer', 'qa_engineer',
  'designer', 'technical_writer', 'support_engineer', 'finance_manager', 'marketing_manager', 'viewer'
);

CREATE TYPE developer_agreement_type AS ENUM (
  'developer_agreement', 'marketplace_policies', 'api_terms', 'privacy_policy'
);

-- ----------------------------------------------------------------------------
-- Developer profiles. One per user — a user applies once; if they later also
-- create/join an organization, that's a separate row in developer_organizations
-- / developer_org_members, not a second developer profile.
-- ----------------------------------------------------------------------------
CREATE TABLE developers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    developer_name          VARCHAR(150) NOT NULL,
    organization_name       VARCHAR(200),
    country                 VARCHAR(100) NOT NULL,
    developer_category      developer_category NOT NULL,
    website                 TEXT,
    github_url              TEXT,
    portfolio_url           TEXT,
    primary_languages       TEXT[] NOT NULL DEFAULT '{}',
    tech_stack              TEXT[] NOT NULL DEFAULT '{}',
    years_experience         SMALLINT,
    business_category       VARCHAR(150),
    application_description TEXT NOT NULL,
    expected_api_usage      VARCHAR(100),
    status                  developer_status NOT NULL DEFAULT 'pending',
    reviewed_by             UUID REFERENCES users(id),
    reviewed_at             TIMESTAMPTZ,
    rejection_reason        TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_developers_status ON developers(status);

-- Every developer must explicitly accept each agreement type before their
-- application can even reach an admin's review queue (enforced in
-- developerPlatformService.js, not the DB, so the wording/version of an
-- agreement can change without a migration).
CREATE TABLE developer_agreement_acceptances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id    UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    agreement_type  developer_agreement_type NOT NULL,
    version         VARCHAR(20) NOT NULL DEFAULT 'v1',
    accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(developer_id, agreement_type)
);

-- ----------------------------------------------------------------------------
-- Developer Organizations — companies/teams. A developer creates one and
-- becomes its 'owner' member; other developers join via developer_org_members.
-- ----------------------------------------------------------------------------
CREATE TABLE developer_organizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(200) NOT NULL,
    slug                VARCHAR(220) NOT NULL UNIQUE,
    logo_url            TEXT,
    description         TEXT,
    verified_badge      BOOLEAN NOT NULL DEFAULT FALSE,
    website             TEXT,
    business_info       JSONB NOT NULL DEFAULT '{}',
    owner_developer_id  UUID NOT NULL REFERENCES developers(id),
    wallet_balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
    status              developer_status NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_developer_organizations_status ON developer_organizations(status);

CREATE TABLE developer_org_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES developer_organizations(id) ON DELETE CASCADE,
    developer_id    UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    role            developer_org_role NOT NULL DEFAULT 'viewer',
    invited_by      UUID REFERENCES developers(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','removed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, developer_id)
);

-- ----------------------------------------------------------------------------
-- API Catalog — read-only reference data that seeds the Developer Dashboard's
-- API Centre / API Explorer. Keys/OAuth apps/actual request execution against
-- these arrive in phase 51 (Sandbox) — for now this is documentation-grade
-- metadata only, no live traffic runs through it.
-- ----------------------------------------------------------------------------
CREATE TABLE developer_api_catalog (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key           VARCHAR(80) NOT NULL UNIQUE,
    name          VARCHAR(150) NOT NULL,
    category      VARCHAR(100) NOT NULL,
    description   TEXT,
    version       VARCHAR(20) NOT NULL DEFAULT 'v1',
    status        VARCHAR(20) NOT NULL DEFAULT 'operational',
    docs_url      TEXT,
    sort_order    INT NOT NULL DEFAULT 0
);

INSERT INTO developer_api_catalog (key, name, category, description, sort_order) VALUES
  ('authentication', 'Authentication API', 'Platform', 'Sign-up, sign-in, tokens and session management.', 1),
  ('users', 'Users API', 'Platform', 'User profiles and account data.', 2),
  ('products', 'Products API', 'Commerce', 'Catalog, variants, pricing and media.', 3),
  ('categories', 'Categories API', 'Commerce', 'Marketplace category tree.', 4),
  ('inventory', 'Inventory API', 'Commerce', 'Stock levels across warehouses and sellers.', 5),
  ('orders', 'Orders API', 'Commerce', 'Create, fulfil and track orders.', 6),
  ('payments', 'Payments API', 'Finance', 'Charges, payouts and settlement.', 7),
  ('wallet', 'Wallet API', 'Finance', 'Balances, top-ups and transfers.', 8),
  ('receipts', 'Receipts API', 'Finance', 'Digital receipts for orders and payouts.', 9),
  ('invoices', 'Invoices API', 'Finance', 'Generate and reconcile invoices.', 10),
  ('delivery', 'Delivery API', 'Logistics', 'Rate shopping and label generation.', 11),
  ('tracking', 'Tracking API', 'Logistics', 'Real-time shipment location events.', 12),
  ('manufacturers', 'Manufacturers API', 'Vertical', 'Production capacity and bulk quoting.', 13),
  ('suppliers', 'Suppliers API', 'Vertical', 'Supplier catalogs and purchase orders.', 14),
  ('agriculture', 'Agriculture API', 'Vertical', 'Harvest listings and cold-chain data.', 15),
  ('wholesale', 'Wholesale API', 'Vertical', 'B2B wholesale catalogs and bulk orders.', 16),
  ('property', 'Property API', 'Vertical', 'Jedida Stays listings and bookings.', 17),
  ('trust_engine', 'Trust Engine API', 'Trust & Safety', 'Seller verification and risk scoring.', 18),
  ('chat', 'Chat API', 'Trust & Safety', 'Buyer-seller messaging with moderation.', 19),
  ('ai', 'AI API', 'Intelligence', 'Product descriptions, ranking and merchandising AI.', 20),
  ('ai_training', 'AI Training API', 'Intelligence', 'Submit and manage AI training contributions.', 21),
  ('notifications', 'Notifications API', 'Platform', 'Push, SMS and email delivery.', 22),
  ('reports', 'Reports API', 'Analytics', 'Scheduled and on-demand business reports.', 23),
  ('analytics', 'Analytics API', 'Analytics', 'Usage, sales and cohort analytics.', 24),
  ('store_builder', 'Store Builder API', 'Commerce', 'Programmatic storefronts, themes and pages.', 25),
  ('theme', 'Theme API', 'Commerce', 'Storefront themes and design tokens.', 26),
  ('plugin', 'Plugin API', 'Commerce', 'Install and configure marketplace plugins.', 27),
  ('marketplace', 'Marketplace API', 'Platform', 'App listings, installs and reviews.', 28);
