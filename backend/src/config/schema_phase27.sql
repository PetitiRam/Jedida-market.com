-- Phase 27: Escrow auto-release after the buyer protection period expires.
--
-- Task requirement: "escrow funds can only be released through approved
-- workflows after delivery confirmation OR the protection period expires."
-- Phase 26 covered the delivery-confirmation release path (releaseFunds,
-- guarded by funds_released_at). This phase adds the second approved
-- workflow — a time-based release — without touching either existing path.

-- Configurable protection-period length (days a buyer has to confirm
-- delivery, dispute, or request a refund before the platform will release
-- escrow automatically). Additive column with a sane default; existing
-- rows are unaffected.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS escrow_protection_days INTEGER NOT NULL DEFAULT 7;

-- Recorded per-order at the moment payment is confirmed (whichever of the
-- three payment-confirmation paths — confirmPayment, confirmCartPayment,
-- approvePayment — runs first for that order), so it reflects the setting
-- in effect at checkout time rather than a value that could change under
-- an order already in flight.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS protection_period_ends_at TIMESTAMPTZ;

-- Used by the auto-release sweep to find eligible orders without a full
-- table scan.
CREATE INDEX IF NOT EXISTS idx_orders_protection_period
  ON orders(protection_period_ends_at)
  WHERE funds_released_at IS NULL;
