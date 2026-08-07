-- Phase 9: chat message translation support (LibreTranslate).
-- preferred_language drives which language a user's chat messages get
-- translated into for them; translations caches results per message so we
-- don't re-call the translation API every time a conversation is reloaded.

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'en';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS translations JSONB NOT NULL DEFAULT '{}';
