-- Phase 84: Shipping Provider approval lifecycle + seller connections.
--
-- Extends the existing Logistics Hub (schema_phase81) rather than building
-- a second parallel provider system, per the spec's "one reusable approval
-- engine" rule (section 10/20): shipping_providers gets the SAME
-- provider_status enum/lifecycle that provider_registry (payments) already
-- uses in schema_phase83, instead of a shipping-specific status type.
--
-- Scope note: this phase adds the seller-facing connect/disconnect layer
-- and a real admin approval lifecycle on top of the existing shipping
-- provider registry. It deliberately does NOT gate shipping_quotes or
-- shipping_bookings on a seller's connection state — that flow is B2B
-- freight quoting used today without any such restriction, and gating it
-- would be a much larger, riskier change to touch in this pass. Treat
-- seller_shipping_connections the same way seller_provider_connections
-- started out before checkout enforcement was added on top of it later.

ALTER TABLE shipping_providers ADD COLUMN IF NOT EXISTS approval_status provider_status NOT NULL DEFAULT 'active';
-- Backfill from the existing boolean so current behavior is unchanged:
-- providers already marked active keep working exactly as before.
UPDATE shipping_providers SET approval_status = CASE WHEN active THEN 'active' ELSE 'suspended' END;

CREATE TABLE IF NOT EXISTS shipping_provider_approval_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES shipping_providers(id) ON DELETE CASCADE,
  previous_status provider_status,
  new_status      provider_status NOT NULL,
  actor_id        UUID REFERENCES users(id),
  reason          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_provider_approval_actions_provider ON shipping_provider_approval_actions(provider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seller_shipping_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  provider_id     UUID NOT NULL REFERENCES shipping_providers(id) ON DELETE CASCADE,
  status          seller_provider_connection_status NOT NULL DEFAULT 'connected',
  connected_at    TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_seller_shipping_connections_shop ON seller_shipping_connections(shop_id);
