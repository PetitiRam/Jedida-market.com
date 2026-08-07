-- ============================================================
-- schema_phase64_payment_webhook_security.sql
-- Immutable log of every payment-provider webhook received, verified or
-- not — closes "Log all payment events" and gives Super Admins a trail
-- to investigate disputed/failed payments. Purely additive.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            VARCHAR(20) NOT NULL,          -- 'stripe' | 'flutterwave' | 'coinbase' | 'dpo'
  event_type          VARCHAR(100),                  -- provider's own event name, if any
  order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
  provider_reference  VARCHAR(255),
  signature_valid     BOOLEAN NOT NULL,
  action_taken        VARCHAR(30) NOT NULL,          -- 'confirmed' | 'ignored' | 'rejected' | 'error'
  detail              TEXT,
  payload             JSONB DEFAULT '{}',
  source_ip           VARCHAR(64),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_provider ON payment_events(provider, created_at DESC);
