-- ============================================================
-- schema_phase81_logistics_hub.sql
-- Jedida Logistics Hub — multi-provider shipping (local courier,
-- last-mile, trucking, freight forwarding, air/sea freight, warehouse,
-- customs broker), built as a provider registry + rate comparison +
-- booking/tracking layer. Purely additive.
--
-- Design notes:
-- * Does NOT touch drivers/deliveries/tracking_events (phase4) — that
--   single-driver in-house delivery system keeps working exactly as-is
--   for ordinary local orders. This is a parallel system for the
--   multi-provider B2B/import case (freight forwarders, customs
--   brokers, etc.) that phase4 was never designed for.
-- * shipping_providers.integration_type is 'manual' or 'api' on
--   purpose — see services/logisticsProviderAdapter.js. No real
--   external freight API credentials exist for this project, so every
--   provider ships as 'manual' (admin/provider staff key in quotes and
--   status updates by hand) rather than fabricating an undocumented
--   external endpoint. The adapter interface is still real: swapping a
--   provider to 'api' later means writing one adapter file, not
--   touching any calling code.
-- * shipping_quote_options is the actual "rate comparison" surface —
--   one row per provider's response to a shipping_quote request.
-- ============================================================

CREATE TYPE shipping_provider_type AS ENUM (
  'local_courier', 'last_mile', 'trucking', 'freight_forwarding',
  'air_freight', 'sea_freight', 'warehouse', 'customs_broker'
);
CREATE TYPE shipping_integration_type AS ENUM ('manual', 'api');
CREATE TYPE shipping_quote_status AS ENUM ('requested', 'quoted', 'expired', 'booked');
CREATE TYPE shipping_booking_status AS ENUM (
  'booked', 'pickup_scheduled', 'picked_up', 'in_transit', 'customs', 'delivered', 'cancelled'
);

-- ------------------------------------------------------------
-- PROVIDER REGISTRY
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_providers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(150) NOT NULL,
  provider_type     shipping_provider_type NOT NULL,
  integration_type  shipping_integration_type NOT NULL DEFAULT 'manual',
  -- Non-secret config only (e.g. { "apiBaseUrlEnvVar": "ACME_FREIGHT_API_BASE" })
  -- — actual credentials live in process.env, never here.
  integration_config JSONB NOT NULL DEFAULT '{}',
  countries_served  TEXT[] NOT NULL DEFAULT '{}',
  contact_email     VARCHAR(255),
  contact_phone     VARCHAR(50),
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_providers_type ON shipping_providers(provider_type) WHERE active = TRUE;

CREATE TRIGGER trg_shipping_providers_updated_at BEFORE UPDATE ON shipping_providers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- QUOTE REQUESTS + RATE COMPARISON
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_quotes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_country        VARCHAR(100) NOT NULL,
  origin_city           VARCHAR(150),
  destination_country   VARCHAR(100) NOT NULL,
  destination_city      VARCHAR(150),
  weight_kg             NUMERIC(10,2),
  dimensions            JSONB NOT NULL DEFAULT '{}', -- { lengthCm, widthCm, heightCm }
  cargo_description     TEXT,
  -- Loose link so a quote can be requested against a Jedida Wanted
  -- request, an order, or standalone — same pattern as
  -- inspection_requests (phase79).
  linked_context        JSONB NOT NULL DEFAULT '{}', -- { wantedRequestId, orderId }
  status                shipping_quote_status NOT NULL DEFAULT 'requested',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (weight_kg IS NULL OR weight_kg > 0)
);

CREATE INDEX IF NOT EXISTS idx_shipping_quotes_requester ON shipping_quotes(requested_by);

CREATE TABLE IF NOT EXISTS shipping_quote_options (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       UUID NOT NULL REFERENCES shipping_quotes(id) ON DELETE CASCADE,
  provider_id    UUID NOT NULL REFERENCES shipping_providers(id) ON DELETE CASCADE,
  service_type   VARCHAR(100), -- e.g. "Door-to-door sea freight, 20ft container"
  price          NUMERIC(14,2) NOT NULL,
  currency       VARCHAR(10) NOT NULL DEFAULT 'USD',
  estimated_days INTEGER,
  notes          TEXT,
  submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL, -- admin/provider rep who entered this rate
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_shipping_quote_options_quote ON shipping_quote_options(quote_id);

-- ------------------------------------------------------------
-- BOOKINGS + TRACKING
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          UUID REFERENCES shipping_quotes(id) ON DELETE SET NULL,
  quote_option_id   UUID REFERENCES shipping_quote_options(id) ON DELETE SET NULL,
  provider_id       UUID NOT NULL REFERENCES shipping_providers(id) ON DELETE CASCADE,
  booked_by         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  pickup_address    TEXT,
  dropoff_address   TEXT,
  tracking_reference VARCHAR(150),

  status            shipping_booking_status NOT NULL DEFAULT 'booked',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_bookings_provider ON shipping_bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_shipping_bookings_booked_by ON shipping_bookings(booked_by);

CREATE TRIGGER trg_shipping_bookings_updated_at BEFORE UPDATE ON shipping_bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS shipping_tracking_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES shipping_bookings(id) ON DELETE CASCADE,
  status      shipping_booking_status NOT NULL,
  note        TEXT,
  location    VARCHAR(255),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_tracking_booking ON shipping_tracking_events(booking_id, created_at);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shipping_quote_ready';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'shipping_status_update';
