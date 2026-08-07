-- Phase 73: payout methods (bank account / mobile money) and business
-- (shop) deletion — neither existed before this. Withdrawal destinations
-- were previously entered fresh on every withdrawal request with no
-- saved-method concept, and there was no way to delete a shop at all
-- (soft or hard). Both are now real, gated by face verification +
-- MFA at the route layer (see routes/payoutMethods.js, shopsController.js
-- deleteMyShop).

CREATE TYPE payout_method_type AS ENUM ('bank_account', 'mobile_money');

-- One saved payout method per user — matches how withdrawal requests
-- already work (a single `destination` string). If multi-method support
-- is wanted later, drop the UNIQUE(user_id) and add an is_default flag.
CREATE TABLE IF NOT EXISTS payout_methods (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  method_type         payout_method_type NOT NULL,
  provider            TEXT NOT NULL,          -- bank name, or mobile money network (MTN, Airtel, etc.)
  account_identifier  TEXT NOT NULL,          -- account number or phone number
  account_name        TEXT NOT NULL,          -- name on the account — must match KYC identity, checked at review time
  last_changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_changed_by     UUID REFERENCES users(id), -- usually the owner; an admin override is also possible
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Soft delete for shops — a business is never hard-deleted (financial/
-- order history must survive), just marked deleted and hidden from
-- public listings. 'deleted' joins the existing account_status enum
-- shops.status already uses.
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'deleted';

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
