-- Phase 95: JEDIDA Financial Ledger foundation.
--
-- This does NOT replace escrow_ledger (phase 3) or wallet_transactions
-- (phase 26) — those keep recording every existing wallet-balance
-- movement exactly as they do today, and no historical row in either is
-- touched. What's missing today is a single OMNICHANNEL transaction
-- record: escrow_ledger only knows about marketplace-order escrow,
-- wallet_transactions is scoped to one wallet at a time, and neither
-- carries provider reference/fee/reconciliation fields. POS, deposits,
-- withdrawals, transfers and future partner-app sales all need one
-- shared record shape to land in — that's financial_transactions below.
-- Existing code keeps writing escrow_ledger/wallet_transactions exactly
-- as before; going forward, the same call sites also write one
-- financial_transactions row via ledgerService.postTransaction() so
-- every money movement — regardless of channel — is queryable from one
-- place (the future Financial Control Center).
--
-- Order state (order_status, phase 3) is left untouched. Two new columns
-- are added to orders instead of overloading order_status, per the
-- "financial state must be separate from order state" principle:
-- financial_state (where are the funds) and release_state (can the
-- seller be paid). A completed order and a releasable-funds order are
-- related but not the same fact.

-- ===== SIX-CHARACTER PUBLIC ORDER REFERENCE =====
-- Internal PK (orders.id, UUID) is unchanged and still used for every
-- foreign key. public_ref is purely the human-facing identifier shown to
-- buyers/sellers/support — never sequential, so it doesn't expose order
-- volume.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_ref CHAR(6);

CREATE OR REPLACE FUNCTION generate_order_public_ref()
RETURNS CHAR(6) AS $$
DECLARE
  -- Unambiguous charset: no 0/O or 1/I/L confusion at a glance.
  chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_order_public_ref()
RETURNS TRIGGER AS $$
DECLARE
  candidate CHAR(6);
  tries INT := 0;
BEGIN
  IF NEW.public_ref IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := generate_order_public_ref();
    tries := tries + 1;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE public_ref = candidate);
    IF tries > 20 THEN
      RAISE EXCEPTION 'Could not generate a unique order public_ref after % tries', tries;
    END IF;
  END LOOP;
  NEW.public_ref := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_public_ref ON orders;
CREATE TRIGGER trg_orders_public_ref BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_public_ref();

-- Backfill every existing order (one-time, collision-safe by construction
-- since each UPDATE re-checks NOT EXISTS against rows already assigned).
DO $$
DECLARE
  r RECORD;
  candidate CHAR(6);
  tries INT;
BEGIN
  FOR r IN SELECT id FROM orders WHERE public_ref IS NULL LOOP
    tries := 0;
    LOOP
      candidate := generate_order_public_ref();
      tries := tries + 1;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE public_ref = candidate);
      IF tries > 20 THEN
        RAISE EXCEPTION 'Could not backfill public_ref for order %', r.id;
      END IF;
    END LOOP;
    UPDATE orders SET public_ref = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE orders ALTER COLUMN public_ref SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_public_ref_key') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_public_ref_key UNIQUE (public_ref);
  END IF;
END $$;

-- ===== FINANCIAL STATE / RELEASE STATE (separate from order_status) =====
CREATE TYPE order_financial_state AS ENUM (
  'funds_pending',     -- payment initiated, not yet confirmed
  'funds_controlled',  -- payment confirmed, held under JEDIDA financial control
  'releasable',        -- completion condition met, awaiting/eligible for release
  'released',          -- seller payable credited
  'blocked',           -- dispute/fraud/risk hold — release prevented
  'reversed',          -- payment reversed by provider
  'refunded'           -- refunded to buyer
);

CREATE TYPE order_release_state AS ENUM (
  'not_applicable',    -- no funds controlled yet
  'pending',           -- funds controlled, release condition not yet met
  'eligible',          -- release condition met, awaiting authorized release
  'released',
  'blocked'
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_state order_financial_state NOT NULL DEFAULT 'funds_pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS release_state order_release_state NOT NULL DEFAULT 'not_applicable';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_hold_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_financial_state ON orders(financial_state);
CREATE INDEX IF NOT EXISTS idx_orders_release_state ON orders(release_state);

-- ===== CENTRAL FINANCIAL TRANSACTIONS LEDGER =====
CREATE TYPE financial_transaction_type AS ENUM (
  'order_payment', 'pos_payment', 'deposit', 'withdrawal', 'transfer',
  'refund', 'fee', 'commission', 'seller_payable', 'release', 'reversal',
  'adjustment'
);

CREATE TYPE financial_transaction_status AS ENUM (
  'pending', 'succeeded', 'failed', 'reversed', 'cancelled'
);

CREATE TYPE financial_transaction_source AS ENUM (
  'marketplace', 'pos', 'partner_app', 'wallet', 'admin', 'system'
);

CREATE TYPE reconciliation_status AS ENUM (
  'unreconciled', 'matched', 'mismatched', 'missing_provider_record'
);

-- Append-only. Corrections are compensating rows (see
-- financial_transaction_events / spec principle "never overwrite,
-- create compensating entries"), never UPDATEs of amount/status history.
CREATE TABLE IF NOT EXISTS financial_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short human-readable reference, e.g. "TXN-7K4P2Q9X" — distinct from
  -- provider_transaction_id, which belongs to the provider, not JEDIDA.
  reference             VARCHAR(24) UNIQUE NOT NULL,

  transaction_type      financial_transaction_type NOT NULL,
  status                financial_transaction_status NOT NULL DEFAULT 'pending',
  source                financial_transaction_source NOT NULL,

  order_id              UUID REFERENCES orders(id),
  order_public_ref      CHAR(6),

  buyer_id              UUID REFERENCES users(id),
  seller_id             UUID REFERENCES users(id),
  shop_id               UUID REFERENCES shops(id),
  actor_id              UUID REFERENCES users(id), -- who/what caused this row (cashier, admin, buyer, system)

  source_wallet_id      UUID REFERENCES wallets(id),
  destination_wallet_id UUID REFERENCES wallets(id),

  amount                NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  fee_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount            NUMERIC(14,2) NOT NULL,
  currency              VARCHAR(10) NOT NULL DEFAULT 'USD',

  payment_method        VARCHAR(60),        -- e.g. mtn_mobile_money, card, cash, wallet
  provider_code          VARCHAR(60),        -- provider_registry.code, kept as text so a
                                              -- transaction row survives a provider being
                                              -- retired/renamed in provider_registry
  provider_transaction_id VARCHAR(255),
  provider_reference     VARCHAR(255),

  reconciliation_status  reconciliation_status NOT NULL DEFAULT 'unreconciled',

  -- Guarantees "repeated button taps / repeated webhook deliveries must
  -- not create duplicate ledger entries" (spec #32) at the DB layer, not
  -- just in application code. Callers that don't have a natural
  -- idempotency key (e.g. a one-off admin adjustment) pass the
  -- transaction's own future id — see ledgerService.postTransaction.
  idempotency_key        VARCHAR(255) UNIQUE NOT NULL,

  failure_reason          TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}',

  created_by             UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_txn_order ON financial_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_order_public_ref ON financial_transactions(order_public_ref);
CREATE INDEX IF NOT EXISTS idx_fin_txn_buyer ON financial_transactions(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_txn_seller ON financial_transactions(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_txn_shop ON financial_transactions(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_txn_type_status ON financial_transactions(transaction_type, status);
CREATE INDEX IF NOT EXISTS idx_fin_txn_created ON financial_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_txn_provider_ref ON financial_transactions(provider_code, provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_reconciliation ON financial_transactions(reconciliation_status);

CREATE TRIGGER trg_fin_txn_updated_at BEFORE UPDATE ON financial_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Status-change / correction audit trail. A correction to a posted
-- transaction is a new event + a new compensating financial_transactions
-- row (transaction_type='adjustment' or 'reversal'), never a silent
-- UPDATE of amount/status on the original row.
CREATE TABLE IF NOT EXISTS financial_transaction_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID NOT NULL REFERENCES financial_transactions(id) ON DELETE CASCADE,
  previous_status   financial_transaction_status,
  new_status        financial_transaction_status NOT NULL,
  reason            TEXT,
  actor_id          UUID REFERENCES users(id),
  ip_address        VARCHAR(64),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_txn_events_txn ON financial_transaction_events(transaction_id, created_at DESC);

-- 'ledger' becomes a first-class permission area alongside the existing
-- ADMIN_ROLE_PERMISSIONS map in middleware/auth.js (finance + approvals
-- get it there, not here — that map is application code, not schema).
