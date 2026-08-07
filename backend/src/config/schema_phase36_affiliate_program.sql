-- Phase 36: Affiliate / Referral Program
-- Referral links + QR, upgrade/sale commissions, a self-contained affiliate
-- wallet + withdrawal queue (mirrors the wallets/withdrawal_requests
-- pattern from phase3/4 but kept separate so affiliate earnings can be
-- reported and held for review independently of marketplace earnings),
-- admin-configurable settings, and Petiti AI fraud-hold plumbing.
-- No existing table's meaning changes — additive only.

-- ===== Referral identity on every user =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Two-step registration (authController.js registerStep1/registerStep2)
-- needs to carry the referral code + signup IP from step 1 (when the
-- referral link was actually used) through to step 2 (when the account
-- and the permanent affiliate_referrals row are created).
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS referral_code_used VARCHAR(20);
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS signup_ip VARCHAR(64);

-- ===== Permanent referral record =====
-- One row per successfully-registered referred user. referred_user_id is
-- UNIQUE so a referral relationship, once recorded, can never be
-- overwritten or duplicated by a later registration attempt.
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code_used VARCHAR(20) NOT NULL,
  signup_ip          VARCHAR(64),
  signup_device_id   TEXT,
  -- NULL | 'self_referral' | 'duplicate_device' | 'duplicate_ip' | 'referral_abuse'
  fraud_flag         VARCHAR(40),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referrer ON affiliate_referrals(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_device ON affiliate_referrals(referrer_id, signup_device_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_ip ON affiliate_referrals(referrer_id, signup_ip);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_flag ON affiliate_referrals(fraud_flag) WHERE fraud_flag IS NOT NULL;

-- ===== Commission ledger (audit trail + one-payment-per-source guarantee) =====
CREATE TYPE affiliate_commission_type AS ENUM ('upgrade', 'sale');
CREATE TYPE affiliate_commission_status AS ENUM ('available', 'held', 'rejected');

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             affiliate_commission_type NOT NULL,
  -- role_upgrades.id for type='upgrade', orders.id for type='sale'.
  source_id        UUID NOT NULL,
  base_amount      NUMERIC(14,2) NOT NULL,
  percent_applied  NUMERIC(5,2) NOT NULL,
  amount           NUMERIC(14,2) NOT NULL,
  currency         VARCHAR(10) NOT NULL,
  status           affiliate_commission_status NOT NULL DEFAULT 'available',
  hold_reason      TEXT,
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Guarantees a commission is only ever paid once per upgrade/order,
  -- even if the crediting call is retried (ON CONFLICT DO NOTHING).
  UNIQUE (type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_referrer ON affiliate_commissions(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON affiliate_commissions(status);

-- ===== Per-user affiliate earnings summary (mutable, mirrors `wallets`) =====
CREATE TABLE IF NOT EXISTS affiliate_wallets (
  user_id                    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available_balance          NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending_earnings           NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending_withdrawal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_earnings             NUMERIC(14,2) NOT NULL DEFAULT 0,
  upgrade_commissions_total  NUMERIC(14,2) NOT NULL DEFAULT 0,
  sales_commissions_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency                   VARCHAR(10) NOT NULL DEFAULT 'UGX',
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Movement audit ledger for affiliate_wallets (mirrors wallet_transactions).
CREATE TABLE IF NOT EXISTS affiliate_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction      VARCHAR(10) NOT NULL, -- 'credit' | 'debit'
  amount         NUMERIC(14,2) NOT NULL,
  balance_after  NUMERIC(14,2) NOT NULL,
  reference_type VARCHAR(40) NOT NULL,
  reference_id   UUID,
  note           TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_user ON affiliate_ledger(user_id, created_at DESC);

-- affiliate_wallets row created automatically for every new user, same
-- trigger pattern as create_user_wallet() in schema.sql.
CREATE OR REPLACE FUNCTION create_affiliate_wallet()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO affiliate_wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_affiliate_wallet ON users;
CREATE TRIGGER trg_create_affiliate_wallet AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_affiliate_wallet();

-- Backfill wallets for any users that already existed before this migration.
INSERT INTO affiliate_wallets (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ===== Withdrawals (mirrors withdrawal_requests) =====
CREATE TYPE affiliate_withdrawal_status AS ENUM ('pending', 'paid', 'rejected');

CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         NUMERIC(14,2) NOT NULL,
  currency       VARCHAR(10) NOT NULL,
  method         VARCHAR(40) NOT NULL,
  destination    TEXT,
  status         affiliate_withdrawal_status NOT NULL DEFAULT 'pending',
  flagged_reason TEXT,
  reviewed_by    UUID REFERENCES users(id),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_user ON affiliate_withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_status ON affiliate_withdrawals(status);

-- ===== Admin-configurable settings (JSONB, same pattern as phase13) =====
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS affiliate_settings JSONB NOT NULL DEFAULT '{
  "affiliateProgramEnabled": true,
  "upgradeCommissionPercent": 10,
  "salesCommissionPercent": 2,
  "minimumWithdrawal": 10000,
  "withdrawalMethods": [
    {"id": "mobile_money", "name": "Mobile Money"},
    {"id": "bank_transfer", "name": "Bank Transfer"}
  ],
  "selfReferralBlocked": true,
  "maxReferralsPerDeviceOrIpPerDay": 5,
  "maxCommissionsPerDayBeforeHold": 20
}';

-- ===== New notification types for the affiliate program =====
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_referral_joined';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_commission_earned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_withdrawal_update';
