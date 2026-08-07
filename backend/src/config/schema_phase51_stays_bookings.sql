-- ============================================================
-- schema_phase51_stays_bookings.sql
-- Jedida Stays — Phase B: Booking + Payments engine.
--
-- Mirrors the existing orders/payments/escrow pattern (phase3 +
-- phase26 wallet_transactions) rather than reusing the `orders` table
-- itself, which is shaped around a single product/shop/quantity and
-- has MOQ/coupon/inventory logic that doesn't apply to a date-range
-- stay. What IS reused directly, unchanged:
--   - wallets / wallet_transactions (phase2 / phase26)   -> the escrow
--     pool wallet, host payout wallet, and platform fee wallet are the
--     exact same rows orders already use; only reference_type differs
--     ('stays_booking_escrow' / 'stays_booking_release' /
--     'stays_booking_refund' / 'platform_fee').
--   - services/paymentProviders.js ADAPTERS (mtn_mobile_money,
--     airtel_money)                                       -> unchanged.
--   - notifications / notification_type (phase2)          -> reused.
--   - stays_availability (phase50)                        -> a
--     confirmed booking blocks its date range by writing rows here,
--     the same table hosts already use to block dates manually.
-- ============================================================

CREATE TYPE stays_booking_status AS ENUM (
  'pending_payment', 'payment_submitted', 'confirmed',
  'completed', 'cancelled', 'refunded', 'rejected'
);

CREATE TYPE stays_payment_status AS ENUM ('initiated', 'submitted', 'succeeded', 'failed', 'refunded');

CREATE TABLE IF NOT EXISTS stays_bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID NOT NULL REFERENCES stays_properties(id),
  guest_id          UUID NOT NULL REFERENCES users(id),
  host_id           UUID NOT NULL REFERENCES users(id), -- denormalized from stays_properties.owner_id at booking time

  check_in          DATE NOT NULL,
  check_out         DATE NOT NULL,
  nights            INTEGER NOT NULL,
  guests_count      INTEGER NOT NULL DEFAULT 1,
  special_requests  TEXT,

  nightly_subtotal  NUMERIC(12,2) NOT NULL,   -- sum of resolved per-night prices, before fees/discounts
  cleaning_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- from an active stays_special_offers row, if any
  platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 5,
  platform_fee_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'USD',

  status            stays_booking_status NOT NULL DEFAULT 'pending_payment',
  cancellation_reason TEXT,
  cancelled_by      UUID REFERENCES users(id),
  funds_released_at TIMESTAMPTZ,   -- single-use guard, same pattern as orders.funds_released_at

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (check_out > check_in),
  CHECK (nights > 0),
  CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stays_bookings_guest ON stays_bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_stays_bookings_host ON stays_bookings(host_id);
CREATE INDEX IF NOT EXISTS idx_stays_bookings_property ON stays_bookings(property_id, status);
CREATE INDEX IF NOT EXISTS idx_stays_bookings_dates ON stays_bookings(property_id, check_in, check_out);

CREATE TRIGGER trg_stays_bookings_updated_at BEFORE UPDATE ON stays_bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS stays_booking_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES stays_bookings(id) ON DELETE CASCADE,
  method              VARCHAR(30) NOT NULL,  -- 'mtn_mobile_money' | 'airtel_money' (services/paymentProviders.js ADAPTERS keys)
  amount              NUMERIC(12,2) NOT NULL,
  currency            VARCHAR(10) NOT NULL,
  status              stays_payment_status NOT NULL DEFAULT 'initiated',
  provider_reference  VARCHAR(255),
  payer_phone         VARCHAR(32),
  transaction_reference VARCHAR(255),
  proof_image         TEXT,
  raw_response        JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stays_booking_payments_booking ON stays_booking_payments(booking_id);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_booking_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_booking_confirmed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_booking_cancelled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'stays_payout_released';
