-- Phase 15: user management + approval history (spec sections 17-18).

-- A UUID primary key isn't the "real numeric User ID" the spec's admin
-- table calls for. Keep the UUID as the real key (every FK depends on it);
-- add a sequential number purely for display/reference.
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_number SERIAL UNIQUE;

-- role_upgrades.reviewed_by/reviewed_at get overwritten at every transition
-- (payment verified, then KYC verified, then approved all stomp the same
-- two columns), so there was no way to see who did which step — the "each
-- approval keeps history" requirement wasn't actually met. Mirrors the same
-- append-only event-log pattern tracking_events already uses for deliveries.
CREATE TABLE IF NOT EXISTS role_upgrade_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upgrade_id    UUID NOT NULL REFERENCES role_upgrades(id) ON DELETE CASCADE,
  action        VARCHAR(30) NOT NULL,
  from_status   VARCHAR(30),
  to_status     VARCHAR(30) NOT NULL,
  performed_by  UUID REFERENCES users(id),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_role_upgrade_events_upgrade ON role_upgrade_events(upgrade_id, created_at);
