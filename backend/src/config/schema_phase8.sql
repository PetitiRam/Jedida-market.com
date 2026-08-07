-- Phase 8: ChatV2 — the richer conversation-based chat (as opposed to the
-- older single-thread chat_messages-only system in chat.js/ChatPanel.jsx).
-- chatService.js, chatSocket.js, and ChatPanelV2.jsx were all already built
-- against this shape; it just never existed in the database, so every
-- ChatV2 request/socket event failed.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id     UUID REFERENCES users(id),
  order_id      UUID REFERENCES orders(id),
  product_id    UUID REFERENCES products(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id, status);

CREATE TABLE IF NOT EXISTS chat_bridges (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_conversation_id     UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  seller_conversation_id    UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  admin_id                  UUID REFERENCES users(id),
  reason                    TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- chat_messages already exists (phase3) for the older single-thread chat.
-- ChatV2 reuses the same table but needs a conversation to belong to, plus
-- the extra fields ChatPanelV2.jsx already renders (reactions, read status,
-- soft delete, message type, threaded replies).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES chat_messages(id);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'sent';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
