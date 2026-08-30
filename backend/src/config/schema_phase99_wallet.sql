-- Phase 100: JEDIDA Wallet — deposits, transfers, and visible fees.
--
-- withdrawal_requests (phase 6) already has a careful admin-reviewed
-- hold->approve/reject flow (see walletsController.js). That flow is
-- reused as-is, not rebuilt — this just adds fee/net columns to it so a
-- withdrawal's fee is visible before submission (spec #36) instead of
-- silently absent, and two new tables for the actions it never had:
-- deposits (money coming in) and transfers (wallet-to-wallet).

ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2);
UPDATE withdrawal_requests SET net_amount = amount - fee_amount WHERE net_amount IS NULL;
ALTER TABLE withdrawal_requests ALTER COLUMN net_amount SET NOT NULL;

-- A configurable, visible fee schedule — read by both the preview
-- endpoint (shown before submission) and the code path that actually
-- deducts it, so the two can never drift apart.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS wallet_fee_settings JSONB NOT NULL DEFAULT
  '{"depositFeePercent":0,"withdrawalFeePercent":1.5,"transferFeePercent":0,"transferFeeFlat":0}'::jsonb;

CREATE TYPE wallet_deposit_status AS ENUM ('pending', 'succeeded', 'failed');

CREATE TABLE IF NOT EXISTS wallet_deposits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id         UUID NOT NULL REFERENCES wallets(id),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  fee_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'USD',
  method_code       VARCHAR(80) NOT NULL, -- provider_methods.code, or 'cash' equivalent if ever offered
  provider_code     VARCHAR(60),
  provider_reference VARCHAR(255),
  status            wallet_deposit_status NOT NULL DEFAULT 'pending',
  idempotency_key   VARCHAR(255) UNIQUE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_deposits_user ON wallet_deposits(user_id, created_at DESC);
CREATE TRIGGER trg_wallet_deposits_updated_at BEFORE UPDATE ON wallet_deposits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE wallet_transfer_status AS ENUM ('succeeded', 'failed');

CREATE TABLE IF NOT EXISTS wallet_transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id      UUID NOT NULL REFERENCES users(id),
  to_user_id        UUID NOT NULL REFERENCES users(id),
  from_wallet_id    UUID NOT NULL REFERENCES wallets(id),
  to_wallet_id      UUID NOT NULL REFERENCES wallets(id),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  fee_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'USD',
  note              TEXT,
  status            wallet_transfer_status NOT NULL DEFAULT 'succeeded',
  idempotency_key   VARCHAR(255) UNIQUE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_from ON wallet_transfers(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_to ON wallet_transfers(to_user_id, created_at DESC);
