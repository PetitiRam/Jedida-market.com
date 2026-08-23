-- Phase 85: Feature Control Engine.
--
-- Implements the spec's 3-level feature-availability model as one reusable
-- system instead of scattered ad-hoc role checks:
--   LEVEL 1 (global)      -- feature_flags.global_status: has Jedida turned
--                            this capability on for the marketplace at all.
--   LEVEL 2 (eligibility) -- feature_flags.eligible_roles: which seller
--                            roles are even allowed to use it (empty = all).
--   LEVEL 3 (activation)  -- seller_feature_activations: has this specific
--                            shop turned it on for themselves.
--
-- Seeded with 3 features that are REAL, already-shipping functionality
-- today (dropshipping partnerships, B2B, wholesale) — not hypothetical
-- placeholders. Each existing shop is auto-activated for whichever of
-- these it's already eligible for, so this migration changes nothing about
-- current behavior on its own (same backward-compatibility pattern as
-- schema_phase83's payment-provider backfill) — a seller only loses access
-- to something if they, or an admin, explicitly turn it off afterward.
--
-- NOTE: dropshipping is enforced in dropship.js (schema_phase85 shipped
-- with it). b2b and wholesale enforcement was added in a follow-up pass
-- (backend/src/routes/b2b.js) — business-profile/certificates/analytics/
-- incoming-quotes gate on 'b2b', tier pricing gates on 'wholesale'. Buyer-
-- facing actions (creating/accepting/declining a quote) are intentionally
-- left ungated since the caller there is the buyer, not the seller shop
-- this feature engine is scoped to.

CREATE TYPE feature_global_status AS ENUM ('available', 'disabled', 'maintenance');

CREATE TABLE feature_flags (
  key             VARCHAR(60) PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  category        VARCHAR(60),
  global_status   feature_global_status NOT NULL DEFAULT 'disabled',
  eligible_roles  TEXT[] NOT NULL DEFAULT '{}', -- empty = every seller role is eligible
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feature_flag_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key     VARCHAR(60) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  previous_status feature_global_status,
  new_status      feature_global_status NOT NULL,
  actor_id        UUID REFERENCES users(id),
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feature_flag_actions_feature ON feature_flag_actions(feature_key, created_at DESC);

CREATE TABLE seller_feature_activations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  feature_key   VARCHAR(60) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, feature_key)
);
CREATE INDEX idx_seller_feature_activations_shop ON seller_feature_activations(shop_id);

INSERT INTO feature_flags (key, name, description, category, global_status, eligible_roles)
VALUES
  ('dropshipping', 'Dropshipping', 'Browse dropship catalogs, request product access, and run dropship partnerships.', 'commerce', 'available', ARRAY['dropshipper']),
  ('b2b', 'B2B Storefront', 'Business profile, MOQ pricing, and the public wholesale storefront.', 'commerce', 'available', ARRAY['manufacturer','supplier']),
  ('wholesale', 'Wholesale Pricing', 'Quantity-tiered wholesale pricing and quote requests.', 'commerce', 'available', ARRAY['manufacturer','supplier'])
ON CONFLICT (key) DO NOTHING;

-- Backward-compat auto-activation: every shop whose owner role already
-- matches a seeded feature's eligible_roles starts enabled, since this
-- functionality already works unconditionally for them today.
INSERT INTO seller_feature_activations (shop_id, feature_key, enabled)
SELECT s.id, ff.key, TRUE
FROM shops s
JOIN users u ON u.id = s.owner_id
JOIN feature_flags ff ON ff.global_status = 'available'
  AND (ff.eligible_roles = '{}' OR u.primary_role = ANY(ff.eligible_roles))
ON CONFLICT (shop_id, feature_key) DO NOTHING;
