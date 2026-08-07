-- Phase 26: Wallet security, escrow hardening, financial integrity.
--
-- Everything here is additive (new nullable columns / new tables with safe
-- defaults) so it never breaks an existing row or an existing query that
-- only knows about the old columns.

-- ----------------------------------------------------------------------
-- 1. Duplicate escrow-release guard.
--    releaseFunds previously had no record of "we already paid this out",
--    so calling the endpoint twice on the same completed order paid the
--    seller twice from the same escrow hold. This column is the guard:
--    the release query only succeeds once, atomically, per order.
-- ----------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS funds_released_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------
-- 2. Pending-withdrawal bucket, tracked separately from available balance
--    so the wallet UI can show "Available" vs "Pending Withdrawal" without
--    changing what `balance` has always meant (funds not currently held
--    against anything, spendable/withdrawable right now).
-- ----------------------------------------------------------------------
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pending_withdrawal NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------
-- 3. Defense-in-depth against negative balances. NOT VALID so it can't
--    fail a migration over pre-existing data — it still applies to every
--    write from this point forward, which is what actually matters: the
--    application code should never attempt to push a balance negative,
--    and now the database refuses it even if a future code path tries.
-- ----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_nonnegative'
  ) THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_balance_nonnegative CHECK (balance >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_pending_withdrawal_nonnegative'
  ) THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_pending_withdrawal_nonnegative CHECK (pending_withdrawal >= 0) NOT VALID;
  END IF;
END $$;

-- ----------------------------------------------------------------------
-- 4. General wallet audit ledger. escrow_ledger (phase 3) already covers
--    money moving in/out of the escrow pool; this covers every movement
--    on every wallet (user, platform, escrow alike) so each one is
--    individually traceable back to the order/withdrawal/refund that
--    caused it, not just inferable from the running balance.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  direction       VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(14,2) NOT NULL,
  reference_type  VARCHAR(40) NOT NULL, -- order_escrow, order_release, withdrawal_hold, withdrawal_paid, withdrawal_refund, platform_fee
  reference_id    UUID,
  note            TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions(reference_type, reference_id);

-- ----------------------------------------------------------------------
-- 5. Lightweight suspicious-activity flagging for withdrawals — an admin
--    can see at a glance if a request looks unusual (e.g. far above the
--    requester's normal payout size) without a full fraud-scoring engine.
-- ----------------------------------------------------------------------
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS flagged_reason TEXT;
