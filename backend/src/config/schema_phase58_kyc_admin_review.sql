-- Phase 58: Admin KYC Verification Center — reviewer assignment, internal
-- notes, and an activity log for each submission. Builds on phase57.

ALTER TABLE kyc_submissions
  ADD COLUMN IF NOT EXISTS assigned_to     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS internal_notes  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS activity_log    JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions (status);
CREATE INDEX IF NOT EXISTS idx_kyc_assigned_to ON kyc_submissions (assigned_to);
