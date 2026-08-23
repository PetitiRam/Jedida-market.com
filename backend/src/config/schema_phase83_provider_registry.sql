-- Phase 83: Provider Registry (payment category slice).
--
-- Implements the JEDIDA-MARKET upgrade spec's "Payment Provider Registry" /
-- multi-level feature control sections (8, 11, 30) for real:
--   LEVEL 1 (global)     -- settingsCenter "payment" section enableX flags,
--                           UNCHANGED, still the platform-wide master switch.
--   LEVEL 2 (registry)   -- provider_registry.status: has Jedida approved
--                           and activated this specific provider at all.
--   LEVEL 3 (per-seller) -- seller_provider_connections.status: has this
--                           seller actually connected/activated it for
--                           their own shop.
--
-- Deliberately scoped to category='payment' for now (rows below only cover
-- the 5 payment methods that already exist as settingsCenter flags). The
-- table shape supports 'shipping'/'import'/'commerce' categories too, so a
-- future phase can extend into those without a schema rewrite — but no
-- shipping/import rows are seeded here, since building those out for real
-- (adapters, actual provider applications) wasn't part of this pass.

CREATE TYPE provider_category AS ENUM ('payment', 'shipping', 'import', 'commerce', 'other');
CREATE TYPE provider_status AS ENUM ('pending', 'under_review', 'approved', 'active', 'suspended', 'rejected');
CREATE TYPE seller_provider_connection_status AS ENUM ('connected', 'disconnected');

CREATE TABLE provider_registry (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category            provider_category NOT NULL,
  code                VARCHAR(60) NOT NULL,          -- stable slug, e.g. 'pesajet'
  name                VARCHAR(120) NOT NULL,
  description         TEXT,
  status              provider_status NOT NULL DEFAULT 'pending',
  -- Links this registry row back to the real settingsCenter flag that is
  -- still the actual Level-1 on/off switch, so the two layers can never
  -- silently disagree about what "enabled" means.
  settings_flag_key   VARCHAR(60),
  supported_countries TEXT[] DEFAULT '{}',           -- empty = all countries
  config              JSONB NOT NULL DEFAULT '{}',
  created_by          UUID REFERENCES users(id),
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category, code)
);

-- Reusable approval audit trail (spec section 10/20/34) — every status
-- transition on any provider_registry row, who did it, and why.
CREATE TABLE provider_approval_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
  previous_status provider_status,
  new_status      provider_status NOT NULL,
  actor_id        UUID REFERENCES users(id),
  reason          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_provider_approval_actions_provider ON provider_approval_actions(provider_id, created_at DESC);

CREATE TABLE seller_provider_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  provider_id     UUID NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
  status          seller_provider_connection_status NOT NULL DEFAULT 'connected',
  -- Payout destination the seller gave for this provider (phone / account
  -- number) — same free-text-destination pattern withdrawal_requests
  -- already uses. Never a raw provider API secret; those stay backend-only
  -- (per spec section 32) and none exist to store here since these are
  -- still platform-settled methods, not per-seller merchant credentials.
  destination     VARCHAR(255),
  connected_at    TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, provider_id)
);
CREATE INDEX idx_seller_provider_connections_shop ON seller_provider_connections(shop_id);

-- Seed the 5 payment methods that already exist as real settingsCenter
-- flags. Status 'active' here reflects that these are genuinely live and
-- processing real payments today (via the existing manual mobile-money /
-- webhook flow) — this is not a fabricated "everything approved" default,
-- it matches actual platform state at the time of this migration.
INSERT INTO provider_registry (category, code, name, description, status, settings_flag_key, approved_at)
VALUES
  ('payment', 'pesajet', 'PesaJet', 'Mobile Money + Cards', 'active', 'enablePesajet', now()),
  ('payment', 'mobile_money', 'Mobile Money', 'MTN / Airtel — manual reference verification', 'active', 'enableMobileMoney', now()),
  ('payment', 'card_payments', 'Cards', 'Visa / Mastercard', 'active', 'enableCardPayments', now()),
  ('payment', 'bank_transfer', 'Bank Transfer', 'Direct bank payments', 'active', 'enableBankTransfer', now()),
  ('payment', 'cash_on_delivery', 'Cash on Delivery', 'Pay on delivery', 'active', 'enableCash', now())
ON CONFLICT (category, code) DO NOTHING;

-- Backward compatibility (spec section 42): checkout now also requires a
-- shop to have actually "connected" a method (Level 3), on top of the
-- existing global on/off flags (Level 1). Every shop that already existed
-- before this migration gets connected to every payment provider above by
-- default, so no existing seller's checkout silently loses payment methods
-- the moment this ships — only an explicit Disconnect on the new Payments
-- page changes anything from here on. New shops created after this
-- migration start with nothing connected and choose for themselves.
INSERT INTO seller_provider_connections (shop_id, provider_id, status, connected_at)
SELECT s.id, pr.id, 'connected', now()
FROM shops s
CROSS JOIN provider_registry pr
WHERE pr.category = 'payment' AND pr.status = 'active'
ON CONFLICT (shop_id, provider_id) DO NOTHING;
