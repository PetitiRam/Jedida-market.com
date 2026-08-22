-- ============================================================
-- schema_phase78_omnichannel_comms.sql
-- Unified customer communication timeline across WhatsApp Business API
-- and email, merged at read-time with the existing in-platform chat
-- (chat_conversations/chat_messages, phase3/phase8) rather than
-- duplicated into it. Purely additive.
--
-- Design notes:
-- * Deliberately does NOT touch chat_conversations/chat_messages or
--   chatService.js/chatSocket.js — that system already works. Instead,
--   omnichannelController.getUnifiedTimeline() reads both this table
--   AND chat_messages for a given customer and merges them by
--   timestamp when rendering the agent's view. One additive read path,
--   zero risk to the working in-platform chat.
-- * A single omnichannel_messages table (not a separate whatsapp_
--   messages / email_messages table each) keeps "one customer
--   timeline" trivial to query — channel-specific fields that don't
--   apply to every row live in channel_metadata JSONB instead of
--   sparse always-NULL columns.
-- * Moderation reuses chat/contactModerationEngine.js's scanMessageText
--   (unchanged) rather than a second implementation — these are exactly
--   the "integrations controlled and authorized by Jedida" the off-
--   platform-communication-control brief describes, so scanning them
--   is legitimate; nothing outside these channels is ever inspected.
-- * external_message_id + channel is unique so a webhook retry (Meta
--   and most inbound-email providers both retry on non-2xx) can never
--   insert the same message twice.
-- ============================================================

CREATE TYPE omnichannel_channel AS ENUM ('whatsapp', 'email');
CREATE TYPE omnichannel_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE omnichannel_thread_status AS ENUM ('open', 'pending', 'resolved');
CREATE TYPE omnichannel_moderation_status AS ENUM ('clean', 'masked', 'blocked');

-- ------------------------------------------------------------
-- THREADS — one per (customer, channel-identity) pair discovered from
-- an inbound message, or created explicitly when an agent starts an
-- outbound conversation. customer_id is resolved by matching the
-- external phone/email against users.phone_number / users.email; a
-- thread can exist before that match succeeds (customer_id NULL) so no
-- inbound message is ever dropped just because we can't identify the
-- sender yet — an agent can link it manually.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omnichannel_threads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  channel             omnichannel_channel NOT NULL,
  external_identifier VARCHAR(255) NOT NULL,   -- phone (E.164) for whatsapp, email address for email
  assigned_agent_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Optional context so a thread can be traced to what it's actually
  -- about, per the communication-architecture requirement ("every
  -- interaction traceable to a customer, order, RFQ or trade
  -- transaction"). Kept generic/JSONB rather than five separate nullable
  -- FK columns since only one is ever populated at a time.
  linked_context      JSONB NOT NULL DEFAULT '{}', -- { orderId, wantedRequestId, quoteRequestId, businessUserId }
  status              omnichannel_thread_status NOT NULL DEFAULT 'open',
  last_message_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview VARCHAR(200),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, external_identifier)
);

CREATE INDEX IF NOT EXISTS idx_omnichannel_threads_customer ON omnichannel_threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_omnichannel_threads_agent ON omnichannel_threads(assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_omnichannel_threads_last_message ON omnichannel_threads(last_message_at DESC);

CREATE TRIGGER trg_omnichannel_threads_updated_at BEFORE UPDATE ON omnichannel_threads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- MESSAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omnichannel_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL REFERENCES omnichannel_threads(id) ON DELETE CASCADE,
  channel             omnichannel_channel NOT NULL,
  direction           omnichannel_direction NOT NULL,
  sent_by_agent_id    UUID REFERENCES users(id) ON DELETE SET NULL, -- outbound only
  body                TEXT NOT NULL,
  original_body       TEXT,                 -- pre-masking, admin-only visibility
  attachments         JSONB NOT NULL DEFAULT '[]',
  channel_metadata    JSONB NOT NULL DEFAULT '{}', -- e.g. { subject, inReplyTo } for email; { waMessageType } for whatsapp
  moderation_status   omnichannel_moderation_status NOT NULL DEFAULT 'clean',
  moderation_violations JSONB NOT NULL DEFAULT '[]',
  external_message_id VARCHAR(255),          -- Meta wamid / email Message-ID header — dedupe key
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (channel, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_omnichannel_messages_thread ON omnichannel_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_omnichannel_messages_moderation ON omnichannel_messages(moderation_status) WHERE moderation_status != 'clean';

-- ------------------------------------------------------------
-- Platform WhatsApp Business config — one row, references env var
-- NAMES only (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
-- WHATSAPP_WEBHOOK_VERIFY_TOKEN). The actual secrets stay in the
-- process environment; this table never stores a credential value.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_platform_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_phone_number  VARCHAR(30),
  phone_number_id       VARCHAR(60),
  business_account_id   VARCHAR(60),
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_whatsapp_config_updated_at BEFORE UPDATE ON whatsapp_platform_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'omnichannel_message_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'omnichannel_message_flagged';
