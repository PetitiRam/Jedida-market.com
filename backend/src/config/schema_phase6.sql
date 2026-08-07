-- JEDIDA Marketplace — Phase 6 schema
-- Two-step upgrade registration (business info now, KYC later in-dashboard),
-- withdrawal requests gated by KYC approval.

-- Step-1 application details captured at upgrade request time (business
-- info, NOT identity documents — KYC documents come later, in-dashboard).
ALTER TABLE role_upgrades ADD COLUMN IF NOT EXISTS application_data JSONB DEFAULT '{}';

CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'paid');

CREATE TABLE withdrawal_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL,
  currency     VARCHAR(10) NOT NULL DEFAULT 'USD',
  method       payment_method NOT NULL,
  destination  VARCHAR(255), -- phone number / account number / wallet address, depending on method
  status       withdrawal_status NOT NULL DEFAULT 'pending',
  reviewed_by  UUID REFERENCES users(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_withdrawals_user ON withdrawal_requests(user_id, created_at DESC);
CREATE INDEX idx_withdrawals_status ON withdrawal_requests(status);
