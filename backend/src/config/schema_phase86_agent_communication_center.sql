-- ============================================================
-- schema_phase86_agent_communication_center.sql
-- Agent Communication Center — sectors, agent groups, conversation
-- assignment/transfer, agent-to-agent + group internal chat, internal
-- notes, group broadcasts with per-customer delivery isolation, and
-- mentions.
--
-- Design notes:
-- * Deliberately does NOT replace chat_conversations/chat_messages
--   (phase3/phase8) — that system already works and customer-facing
--   messages (including broadcast deliveries, see below) continue to
--   live there. This phase only ADDS routing/ownership columns to
--   chat_conversations and builds new tables around it.
-- * Agents are existing users with is_admin = TRUE (schema.sql). No
--   new user_role enum value is introduced — agent_profiles is an
--   additive 1:1 extension row, the same pattern business_profiles
--   uses for sellers. Promotion to agent still goes through the
--   existing admin_assignments flow; this table only adds
--   agent-specific fields (presence, availability) on top.
-- * Broadcast isolation (customers must never see each other) is
--   enforced structurally, not just by permission check: sending a
--   broadcast does not create one shared thread. broadcast_recipients
--   fan out into ordinary chat_conversations/chat_messages rows, one
--   private conversation per customer, tagged back to the broadcast
--   via source_broadcast_id. A customer's chat view is exactly the
--   same query it always was (their own conversations) — there is no
--   code path that could leak a recipient list to a customer because
--   customers never query broadcasts or broadcast_recipients at all
--   (no customer-facing route reads these tables).
-- * Internal (agent<->agent, agent<->group) chat is a fully separate
--   table pair — internal_conversations/internal_messages — not a
--   flag on chat_conversations. This makes "customers cannot access
--   internal chat" a structural guarantee (no customer_id column
--   exists on these tables to even join through) rather than a filter
--   that could be forgotten in a new endpoint.
-- * Sectors/groups/routing/broadcast-permissions are fully
--   admin-configurable rows, never hard-coded values — see
--   agent_sectors, agent_groups, and the reuse of the existing
--   role_permissions table (phase37) for broadcast permission levels
--   (permission = 'broadcast:group' | 'broadcast:sector' |
--   'broadcast:selected' | 'broadcast:all', allowed = true/false),
--   so this phase adds zero new permission plumbing.
-- ============================================================

-- ------------------------------------------------------------
-- SECTORS — top-level business areas (Property, B2B Agriculture,
-- Orders, Payments, ...). Admin-creatable; nothing here is hard-coded.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_sectors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_agent_sectors_updated_at BEFORE UPDATE ON agent_sectors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- AGENT GROUPS — teams within a sector (e.g. "Property – Entebbe
-- Team", "B2B Agriculture Team"). Broadcast/transfer permission
-- *levels* live in role_permissions per-agent (reused, see header);
-- routing_config here is the group's own admin-tunable routing
-- behaviour (auto-assign on/off, weighting), kept JSONB so new
-- routing strategies never need a migration.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id       UUID REFERENCES agent_sectors(id) ON DELETE SET NULL,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  team_lead_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  auto_assignment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  routing_config  JSONB NOT NULL DEFAULT '{}', -- { strategy, weightBy, maxPerAgent, languages, ... }
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_groups_sector ON agent_groups(sector_id);
CREATE TRIGGER trg_agent_groups_updated_at BEFORE UPDATE ON agent_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- GROUP MEMBERSHIP — an agent may belong to multiple groups
-- (multi-sector agents, section 38 of the spec). skills is the
-- per-agent qualification tag list used for routing/eligibility
-- checks (section 14); kept on the membership row since a skill like
-- "Wholesale" is meaningful in the context of a specific group.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_group_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES agent_groups(id) ON DELETE CASCADE,
  agent_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_team_lead  BOOLEAN NOT NULL DEFAULT FALSE,
  skills        TEXT[] NOT NULL DEFAULT '{}',
  added_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_group_members_agent ON agent_group_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_group_members_group ON agent_group_members(group_id);

-- ------------------------------------------------------------
-- AGENT PROFILE — 1:1 extension of an agent (is_admin = TRUE) user
-- row. Presence is authoritative here for cold loads (page refresh,
-- admin reports); the realtime layer (chatSocket.js) pushes live
-- updates and writes through to this row on change.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  presence          VARCHAR(20) NOT NULL DEFAULT 'offline', -- online | away | busy | offline
  presence_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  max_concurrent_chats INTEGER,
  languages         TEXT[] NOT NULL DEFAULT '{}',
  title             VARCHAR(100), -- e.g. 'Senior Agent', 'Support Agent'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_agent_profiles_updated_at BEFORE UPDATE ON agent_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- CONVERSATION ROUTING — additive columns on the existing
-- chat_conversations table (same pattern phase8 used to extend
-- chat_messages), so every customer conversation gains ownership,
-- priority and context without a parallel shadow table.
-- context_type/context_id are generic (not a column per record type)
-- because the set of linkable record types already spans orders,
-- stays_bookings, quote_requests, wanted_requests, shipping_bookings
-- and will keep growing — a fixed FK per type would need a migration
-- every time a new sector is added, which section 70 explicitly rules
-- out.
-- ------------------------------------------------------------
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS agent_group_id UUID REFERENCES agent_groups(id) ON DELETE SET NULL;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES agent_sectors(id) ON DELETE SET NULL;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'normal'; -- low | normal | high | urgent
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS context_type VARCHAR(40); -- 'order' | 'stays_booking' | 'quote_request' | 'wanted_request' | 'shipping_booking' | ...
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS context_id UUID;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS source_broadcast_id UUID; -- FK added below, after broadcasts exists
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_transferred_at TIMESTAMPTZ;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ; -- set when an agent takes an unassigned chat

CREATE INDEX IF NOT EXISTS idx_chat_conversations_agent ON chat_conversations(assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_group ON chat_conversations(agent_group_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_sector ON chat_conversations(sector_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_unassigned ON chat_conversations(status) WHERE assigned_agent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context ON chat_conversations(context_type, context_id);

-- ------------------------------------------------------------
-- TRANSFER HISTORY — full audit trail (section 16/78). Conversation
-- id never changes on transfer (section 17/78) — only ownership
-- columns on chat_conversations move, and each move is recorded here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_transfers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  from_agent_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  to_agent_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  from_group_id       UUID REFERENCES agent_groups(id) ON DELETE SET NULL,
  to_group_id         UUID REFERENCES agent_groups(id) ON DELETE SET NULL,
  transfer_type       VARCHAR(20) NOT NULL DEFAULT 'agent', -- agent | group | sector | specialist | supervisor
  reason              TEXT,
  note                TEXT,
  initiated_by        UUID NOT NULL REFERENCES users(id),
  requires_approval   BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversation_transfers_conversation ON conversation_transfers(conversation_id, created_at DESC);

-- ------------------------------------------------------------
-- INTERNAL NOTES — attached to a customer conversation but never
-- visible to the customer (section 25). Kept structurally separate
-- from chat_messages (rather than a message_type='internal_note'
-- row in the customer's own message stream) so a customer-facing
-- query can never accidentally include one — there is no path from
-- "get messages for conversation X as the customer" that touches
-- this table at all.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  author_id           UUID NOT NULL REFERENCES users(id),
  body                TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation ON internal_notes(conversation_id, created_at);

-- ------------------------------------------------------------
-- INTERNAL CHAT — agent<->agent (direct) and agent<->group (team
-- room). Deliberately its own table pair, not a repurposed
-- chat_conversations row (see header). is_group=false + two
-- participant ids covers a DM; is_group=true + group_id covers a
-- team room shared by every current group member.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group            BOOLEAN NOT NULL DEFAULT FALSE,
  group_id            UUID REFERENCES agent_groups(id) ON DELETE CASCADE, -- set when is_group = TRUE
  participant_one_id  UUID REFERENCES users(id) ON DELETE CASCADE,        -- set when is_group = FALSE
  participant_two_id  UUID REFERENCES users(id) ON DELETE CASCADE,        -- set when is_group = FALSE
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (is_group = TRUE  AND group_id IS NOT NULL AND participant_one_id IS NULL AND participant_two_id IS NULL) OR
    (is_group = FALSE AND group_id IS NULL AND participant_one_id IS NOT NULL AND participant_two_id IS NOT NULL)
  )
);
-- One DM thread per unordered agent pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_conversations_dm
  ON internal_conversations (LEAST(participant_one_id, participant_two_id), GREATEST(participant_one_id, participant_two_id))
  WHERE is_group = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_conversations_group
  ON internal_conversations (group_id) WHERE is_group = TRUE;

CREATE TABLE IF NOT EXISTS internal_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_conversation_id UUID NOT NULL REFERENCES internal_conversations(id) ON DELETE CASCADE,
  sender_id           UUID NOT NULL REFERENCES users(id),
  body                TEXT NOT NULL,
  attachment_url      TEXT,
  attachment_meta     JSONB NOT NULL DEFAULT '{}',
  mentioned_agent_ids UUID[] NOT NULL DEFAULT '{}',
  read_by             UUID[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_internal_messages_conversation ON internal_messages(internal_conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_internal_messages_mentions ON internal_messages USING GIN (mentioned_agent_ids);

-- ------------------------------------------------------------
-- MENTIONS — denormalized notification queue for @mentions raised in
-- internal_messages (or internal_notes). Kept separate from a generic
-- notifications table (if one exists elsewhere) so this phase stays
-- self-contained; wiring into the platform's existing notification
-- delivery is a controller-layer concern, not a schema one.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_mentions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentioned_agent_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentioned_by_id     UUID NOT NULL REFERENCES users(id),
  internal_message_id UUID REFERENCES internal_messages(id) ON DELETE CASCADE,
  internal_note_id    UUID REFERENCES internal_notes(id) ON DELETE CASCADE,
  conversation_id     UUID REFERENCES chat_conversations(id) ON DELETE CASCADE, -- context, if the mention was on a customer conversation's note
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (internal_message_id IS NOT NULL OR internal_note_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_agent_mentions_agent ON agent_mentions(mentioned_agent_id, is_read);

-- ------------------------------------------------------------
-- BROADCASTS — the campaign record. audience_* columns describe how
-- the recipient set was computed (never a hard-coded list); actual
-- fan-out lives in broadcast_recipients.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcasts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id           UUID NOT NULL REFERENCES users(id),
  audience_type       VARCHAR(20) NOT NULL, -- group | sector | selected | all
  audience_group_id   UUID REFERENCES agent_groups(id) ON DELETE SET NULL,
  audience_sector_id  UUID REFERENCES agent_sectors(id) ON DELETE SET NULL,
  audience_count      INTEGER NOT NULL DEFAULT 0,
  message_body        TEXT NOT NULL,
  attachment_url       TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_sender ON broadcasts(sender_id, created_at DESC);

-- Plain ALTER ... ADD CONSTRAINT has no IF NOT EXISTS in Postgres, and
-- migrate.js re-runs every phase file on every migrate — guard with a
-- catalog check so this stays idempotent like the rest of the file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_conversations_source_broadcast'
  ) THEN
    ALTER TABLE chat_conversations ADD CONSTRAINT fk_chat_conversations_source_broadcast
      FOREIGN KEY (source_broadcast_id) REFERENCES broadcasts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- BROADCAST RECIPIENTS — one row per customer. delivery_status tracks
-- the fan-out itself (section 21); conversation_id/message_id point
-- at the ordinary, private chat_conversations/chat_messages row that
-- was created for that customer, which is the ONLY place the
-- customer ever sees this message (section 18-20/62). No recipient
-- list is ever exposed through any customer-facing query.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id        UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id     UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  message_id          UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  delivery_status     VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  read_at             TIMESTAMPTZ,
  replied_at          TIMESTAMPTZ,
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_customer ON broadcast_recipients(customer_id);
