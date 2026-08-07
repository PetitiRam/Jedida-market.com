-- Phase 11: the seller/delivery Upgrade System (role_upgrades + kyc_documents)
-- was broken past its first step. upgradeController.js's state machine uses
-- status values (payment_submitted, payment_verified, payment_rejected,
-- kyc_pending, kyc_verified, kyc_rejected) that were never added to the
-- upgrade_status enum — every transition past "pending_payment" would fail
-- with "invalid input value for enum upgrade_status". And submitKyc() writes
-- to a kyc_documents table that never existed (only the older, unrelated
-- kyc_submissions table — used by nothing in the live upgrade flow — did).

ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS 'payment_submitted';
ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS 'payment_verified';
ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS 'payment_rejected';
ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS 'kyc_pending';
ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS 'kyc_verified';
ALTER TYPE upgrade_status ADD VALUE IF NOT EXISTS 'kyc_rejected';

-- role_upgrades is also missing columns requestUpgrade()/submitPayment() write to.
ALTER TABLE role_upgrades ADD COLUMN IF NOT EXISTS application_data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE role_upgrades ADD COLUMN IF NOT EXISTS applicant_snapshot JSONB NOT NULL DEFAULT '{}';
ALTER TABLE role_upgrades ADD COLUMN IF NOT EXISTS proof_of_payment_url TEXT;

CREATE TABLE IF NOT EXISTS kyc_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upgrade_id              UUID NOT NULL REFERENCES role_upgrades(id) ON DELETE CASCADE,
  national_id_front_url   TEXT NOT NULL,
  national_id_back_url    TEXT NOT NULL,
  selfie_url              TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by             UUID REFERENCES users(id),
  reviewed_at             TIMESTAMPTZ,
  reviewer_notes          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_upgrade ON kyc_documents(upgrade_id);
