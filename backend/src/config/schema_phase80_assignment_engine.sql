-- ============================================================
-- schema_phase80_assignment_engine.sql
-- Generic admin assignment engine (master brief section 36) + customer
-- groups (section 15). Lets admin assign any entity — customer,
-- business, order, wanted request, dispute, omnichannel thread — to an
-- agent, either manually or via a group's round-robin/workload-balanced
-- rule, with every assignment recorded as its own row (never
-- overwritten) so the assignment history is a real audit trail.
-- Purely additive.
--
-- Design notes:
-- * entity_type is VARCHAR + CHECK rather than a Postgres ENUM — this
--   list will grow as more entity kinds need assignment (trade cases,
--   RFQs, etc. in later phases), and ENUM additions are a bigger
--   migration ceremony than a CHECK constraint update.
-- * entity_assignments never UPDATEs an existing row to reassign —
--   reassigning inserts a new row and sets unassigned_at on the old
--   one. That is the audit trail; there's no separate log table to
--   keep in sync with it.
-- * customer_group_members is deliberately manual-only in this phase.
--   Auto-matching membership by country/category needs a settled
--   notion of "customer profile" (company_country lives on
--   business_profiles, not on users) that the general consumer buyer
--   doesn't have yet — rather than fabricate a matching rule that only
--   half-applies, membership is admin-curated for now and the
--   assignment_mode (round_robin/workload_balanced) still gives real
--   automated distribution once a group has members and agents.
-- ============================================================

CREATE TYPE assignment_mode AS ENUM ('manual', 'round_robin', 'workload_balanced');

CREATE TABLE IF NOT EXISTS customer_groups (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(150) NOT NULL,
  description      TEXT,
  criteria         JSONB NOT NULL DEFAULT '{}', -- { country, category, customerType, language, businessSize, priority } — descriptive, not auto-enforced yet (see note above)
  assignment_mode  assignment_mode NOT NULL DEFAULT 'manual',
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_customer_groups_updated_at BEFORE UPDATE ON customer_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS customer_group_agents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, agent_id)
);

CREATE TABLE IF NOT EXISTS customer_group_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_group_members_customer ON customer_group_members(customer_id);

-- ------------------------------------------------------------
-- ASSIGNMENTS — one row per assignment event. Current assignment for an
-- entity is the row where unassigned_at IS NULL; history is every row.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      VARCHAR(40) NOT NULL CHECK (entity_type IN (
                     'customer', 'business', 'order', 'wanted_request',
                     'dispute', 'omnichannel_thread', 'inspection_request',
                     'factory_verification_request'
                   )),
  entity_id        UUID NOT NULL,
  agent_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id         UUID REFERENCES customer_groups(id) ON DELETE SET NULL,
  assignment_mode  assignment_mode NOT NULL DEFAULT 'manual',
  assigned_by      UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_entity_assignments_entity ON entity_assignments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_assignments_agent_open ON entity_assignments(agent_id) WHERE unassigned_at IS NULL;
-- At most one open (unassigned_at IS NULL) assignment per entity —
-- reassigning must close the old row first, keeping "current owner"
-- always unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_assignments_one_open_per_entity
  ON entity_assignments(entity_type, entity_id) WHERE unassigned_at IS NULL;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'entity_assigned_to_you';
