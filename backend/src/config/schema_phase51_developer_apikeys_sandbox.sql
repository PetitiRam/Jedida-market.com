-- ============================================================================
-- PHASE 51 — Developer & Partner Ecosystem: API Keys, OAuth Apps, Sandbox
-- ------------------------------------------------------------------------
-- Builds on phase 50 (developers, developer_organizations). Adds:
--   - api_keys: sandbox/production key pairs, scoped by permission, owned
--     by either a solo developer or a developer organization
--   - oauth_applications + oauth_authorizations: standard OAuth2 client
--     registration + per-user grant records
--   - sandbox_resources: a single JSONB-backed table holding every kind of
--     fake sandbox data (businesses, products, orders, payments, wallet,
--     deliveries, receipts, invoices, properties, agriculture listings,
--     manufacturers, suppliers, customers, chat, notifications, AI) so a
--     developer can exercise the API Explorer against realistic-looking
--     data with zero blast radius on production tables. Keyed by
--     resource_type so "Reset Sandbox" is a single DELETE.
-- Only an approved developer (solo) or an active org member may create
-- keys/apps — enforced in developerPlatformService.js, same as phase 50.
-- ============================================================================

CREATE TYPE api_key_environment AS ENUM ('sandbox', 'production');
CREATE TYPE api_key_status AS ENUM ('active', 'revoked');
CREATE TYPE oauth_app_status AS ENUM ('active', 'suspended');

-- ----------------------------------------------------------------------------
-- API Keys — owned by exactly one of developer_id / org_id (never both).
-- Only key_prefix + key_hash are stored; the full secret is shown once at
-- creation time and never persisted or logged.
-- ----------------------------------------------------------------------------
CREATE TABLE developer_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id    UUID REFERENCES developers(id) ON DELETE CASCADE,
    org_id          UUID REFERENCES developer_organizations(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    environment     api_key_environment NOT NULL DEFAULT 'sandbox',
    key_prefix      VARCHAR(16) NOT NULL,
    key_hash        VARCHAR(128) NOT NULL,
    scopes          TEXT[] NOT NULL DEFAULT '{}',
    status          api_key_status NOT NULL DEFAULT 'active',
    last_used_at    TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES developers(id),
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (developer_id IS NOT NULL AND org_id IS NULL) OR
      (developer_id IS NULL AND org_id IS NOT NULL)
    )
);

CREATE INDEX idx_api_keys_developer ON developer_api_keys(developer_id);
CREATE INDEX idx_api_keys_org ON developer_api_keys(org_id);
CREATE UNIQUE INDEX idx_api_keys_prefix ON developer_api_keys(key_prefix);

-- ----------------------------------------------------------------------------
-- OAuth Applications — standard client_id/client_secret registration for
-- "Sign in / Connect with Jedida" style integrations.
-- ----------------------------------------------------------------------------
CREATE TABLE developer_oauth_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id        UUID REFERENCES developers(id) ON DELETE CASCADE,
    org_id              UUID REFERENCES developer_organizations(id) ON DELETE CASCADE,
    name                VARCHAR(150) NOT NULL,
    description         TEXT,
    client_id           VARCHAR(64) NOT NULL,
    client_secret_hash  VARCHAR(128) NOT NULL,
    redirect_uris       TEXT[] NOT NULL DEFAULT '{}',
    scopes              TEXT[] NOT NULL DEFAULT '{}',
    status              oauth_app_status NOT NULL DEFAULT 'active',
    created_by          UUID NOT NULL REFERENCES developers(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (developer_id IS NOT NULL AND org_id IS NULL) OR
      (developer_id IS NULL AND org_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX idx_oauth_apps_client_id ON developer_oauth_applications(client_id);
CREATE INDEX idx_oauth_apps_developer ON developer_oauth_applications(developer_id);
CREATE INDEX idx_oauth_apps_org ON developer_oauth_applications(org_id);

-- Per-user grants — which platform users have authorized which OAuth app,
-- and with which scopes. Revoking is a status flip, not a delete, so the
-- developer's app-level analytics stay accurate.
CREATE TABLE developer_oauth_authorizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oauth_app_id    UUID NOT NULL REFERENCES developer_oauth_applications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes          TEXT[] NOT NULL DEFAULT '{}',
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
    authorized_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    UNIQUE(oauth_app_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Sandbox — one table for every sandbox resource type, isolated per
-- developer/org owner. "Reset Sandbox" = DELETE WHERE owner matches.
-- ----------------------------------------------------------------------------
CREATE TABLE developer_sandbox_resources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id    UUID REFERENCES developers(id) ON DELETE CASCADE,
    org_id          UUID REFERENCES developer_organizations(id) ON DELETE CASCADE,
    resource_type   VARCHAR(40) NOT NULL CHECK (resource_type IN (
                      'business', 'product', 'order', 'payment', 'wallet', 'delivery',
                      'receipt', 'invoice', 'property', 'agriculture_listing',
                      'manufacturer', 'supplier', 'customer', 'chat', 'notification', 'ai'
                    )),
    data            JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (developer_id IS NOT NULL AND org_id IS NULL) OR
      (developer_id IS NULL AND org_id IS NOT NULL)
    )
);

CREATE INDEX idx_sandbox_developer ON developer_sandbox_resources(developer_id);
CREATE INDEX idx_sandbox_org ON developer_sandbox_resources(org_id);
CREATE INDEX idx_sandbox_type ON developer_sandbox_resources(resource_type);
