ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages(conversation_id, pinned) WHERE pinned = TRUE;
