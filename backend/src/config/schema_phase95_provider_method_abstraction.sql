-- Phase 96: Provider method abstraction.
--
-- provider_registry (phase 83) already models three levels: platform
-- master switch (settingsCenter flag) -> registry approval -> seller
-- connect/disconnect. What it's missing is the level the spec asks for:
-- a provider like PesaJet can expose SEVERAL distinct payment methods
-- (MTN Mobile Money, Airtel Money — Visa/Mastercard are NOT added here,
-- since services/paymentProviders.js's real PesaJet adapter only
-- implements mobile money COLLECTION today; nothing is seeded for a
-- capability the adapter doesn't actually have), and a seller should be
-- able to enable/disable each one individually after connecting the
-- provider — not treat "pesajet" as one flat method the way
-- ordersController.js's METHOD_PROVIDER_CODE map currently does.
--
-- This is purely additive: provider_registry, seller_provider_connections
-- and every existing checkout code path are untouched. provider_methods
-- nests under provider_registry; seller_provider_method_activations nests
-- under seller_provider_connections (a method can't be activated for a
-- shop that hasn't connected the parent provider — enforced in
-- providerAbstraction.js, not just by convention).

CREATE TABLE IF NOT EXISTS provider_methods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES provider_registry(id) ON DELETE CASCADE,
  code            VARCHAR(80) NOT NULL,          -- stable slug, e.g. 'pesajet_mtn_mobile_money'
  name            VARCHAR(120) NOT NULL,         -- display name, e.g. 'MTN Mobile Money'
  -- Which function in services/paymentProviders.js#ADAPTERS actually
  -- executes this method. Several provider_methods rows may point at the
  -- same adapter_key with different adapter_params (e.g. PesaJet's mtn
  -- vs airtel methods both call createPesajetCharge with a different
  -- `network`).
  adapter_key     VARCHAR(60) NOT NULL,
  adapter_params  JSONB NOT NULL DEFAULT '{}',   -- fixed params merged into every call, e.g. {"network":"mtn"}
  requires_fields TEXT[] NOT NULL DEFAULT '{}',  -- caller-supplied fields the adapter still needs, e.g. {phoneNumber}
  is_active       BOOLEAN NOT NULL DEFAULT TRUE, -- platform-level: does JEDIDA currently offer this method at all
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, code)
);
CREATE INDEX IF NOT EXISTS idx_provider_methods_provider ON provider_methods(provider_id);
CREATE TRIGGER trg_provider_methods_updated_at BEFORE UPDATE ON provider_methods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS seller_provider_method_activations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  provider_method_id  UUID NOT NULL REFERENCES provider_methods(id) ON DELETE CASCADE,
  active              BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at        TIMESTAMPTZ,
  deactivated_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, provider_method_id)
);
CREATE INDEX IF NOT EXISTS idx_spma_shop ON seller_provider_method_activations(shop_id);
CREATE TRIGGER trg_spma_updated_at BEFORE UPDATE ON seller_provider_method_activations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== SEED: only methods the real adapters in paymentProviders.js
--            actually implement today. =====
INSERT INTO provider_methods (provider_id, code, name, adapter_key, adapter_params, requires_fields, display_order)
SELECT pr.id, 'pesajet_mtn_mobile_money', 'MTN Mobile Money', 'pesajet', '{"network":"mtn"}'::jsonb, ARRAY['phoneNumber'], 1
FROM provider_registry pr WHERE pr.category = 'payment' AND pr.code = 'pesajet'
ON CONFLICT (provider_id, code) DO NOTHING;

INSERT INTO provider_methods (provider_id, code, name, adapter_key, adapter_params, requires_fields, display_order)
SELECT pr.id, 'pesajet_airtel_money', 'Airtel Money', 'pesajet', '{"network":"airtel"}'::jsonb, ARRAY['phoneNumber'], 2
FROM provider_registry pr WHERE pr.category = 'payment' AND pr.code = 'pesajet'
ON CONFLICT (provider_id, code) DO NOTHING;

-- The existing manually-verified mobile money provider (proof-of-payment
-- reviewed by an admin, not a live API) — kept distinct from PesaJet's
-- live mtn/airtel methods above, since it is genuinely a different flow.
INSERT INTO provider_methods (provider_id, code, name, adapter_key, adapter_params, requires_fields, display_order)
SELECT pr.id, 'mobile_money_mtn_manual', 'MTN Mobile Money (manual)', 'mtn_mobile_money', '{}'::jsonb, ARRAY[]::text[], 1
FROM provider_registry pr WHERE pr.category = 'payment' AND pr.code = 'mobile_money'
ON CONFLICT (provider_id, code) DO NOTHING;

INSERT INTO provider_methods (provider_id, code, name, adapter_key, adapter_params, requires_fields, display_order)
SELECT pr.id, 'mobile_money_airtel_manual', 'Airtel Money (manual)', 'airtel_money', '{}'::jsonb, ARRAY[]::text[], 2
FROM provider_registry pr WHERE pr.category = 'payment' AND pr.code = 'mobile_money'
ON CONFLICT (provider_id, code) DO NOTHING;

INSERT INTO provider_methods (provider_id, code, name, adapter_key, adapter_params, requires_fields, display_order)
SELECT pr.id, 'card_stripe', 'Visa / Mastercard (Stripe)', 'stripe', '{}'::jsonb, ARRAY[]::text[], 1
FROM provider_registry pr WHERE pr.category = 'payment' AND pr.code = 'card_payments'
ON CONFLICT (provider_id, code) DO NOTHING;

INSERT INTO provider_methods (provider_id, code, name, adapter_key, adapter_params, requires_fields, display_order)
SELECT pr.id, 'cash_on_delivery', 'Cash on Delivery', 'cash_on_delivery', '{}'::jsonb, ARRAY[]::text[], 1
FROM provider_registry pr WHERE pr.category = 'payment' AND pr.code = 'cash_on_delivery'
ON CONFLICT (provider_id, code) DO NOTHING;
-- bank_transfer intentionally gets no provider_methods row yet — there is
-- no adapter for it in paymentProviders.js, so nothing is seeded rather
-- than inventing a method the platform can't actually process.

-- Backward compatibility: every shop already connected to a provider
-- (seeded/backfilled in phase 83) starts with that provider's methods
-- activated too, so no existing seller silently loses a payment method
-- the moment this ships. New activations from here on are explicit.
INSERT INTO seller_provider_method_activations (shop_id, provider_method_id, active, activated_at)
SELECT spc.shop_id, pm.id, TRUE, now()
FROM seller_provider_connections spc
JOIN provider_methods pm ON pm.provider_id = spc.provider_id
WHERE spc.status = 'connected'
ON CONFLICT (shop_id, provider_method_id) DO NOTHING;
