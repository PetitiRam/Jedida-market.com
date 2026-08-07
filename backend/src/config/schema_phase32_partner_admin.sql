-- ============================================================
-- schema_phase32_partner_admin.sql
-- Phase 2 of the JEDIDA Partner Program: admin review workflow.
-- Purely additive — new enum values, new nullable columns, new
-- tables only. Nothing existing is altered, dropped, or renamed,
-- and every existing status value keeps its current meaning.
-- ============================================================

-- New stages in the review pipeline (Submitted='pending' already exists).
-- Same reason as schema_phase23: ADD VALUE must not be used in the same
-- transaction it's added in — this file only adds them, nothing below
-- references them, so it's safe regardless of how the migration runner
-- batches statements.
ALTER TYPE partner_application_status ADD VALUE IF NOT EXISTS 'technical_review';
ALTER TYPE partner_application_status ADD VALUE IF NOT EXISTS 'business_review';
ALTER TYPE partner_application_status ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE partner_application_status ADD VALUE IF NOT EXISTS 'more_info_requested';
ALTER TYPE partner_application_status ADD VALUE IF NOT EXISTS 'suspended'; -- post-approval: Super Admin suspends an active partnership

ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_partner_applications_reviewer ON partner_applications(assigned_reviewer_id);

-- Internal notes — many per application, distinct from the single
-- `review_notes` field a decision carries (that one stays as "the note
-- attached to the most recent decision"; this is the running internal
-- discussion thread admins leave for each other).
CREATE TABLE IF NOT EXISTS partner_application_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  note            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_application_notes_app ON partner_application_notes(application_id, created_at DESC);

-- Single audit trail for every admin action on an application — status
-- changes, reviewer assignment, notes, suspend/reactivate. The "Status
-- History" section in the application detail view and the searchable
-- "Audit Log" the spec asks for are the same underlying data, filtered
-- differently, rather than two tables that could drift out of sync.
CREATE TABLE IF NOT EXISTS partner_application_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  admin_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action           VARCHAR(50) NOT NULL, -- 'status_change' | 'reviewer_assigned' | 'note_added' | 'suspended' | 'reactivated'
  previous_status  partner_application_status,
  new_status       partner_application_status,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_audit_log_app ON partner_application_audit_log(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_audit_log_admin ON partner_application_audit_log(admin_id);
