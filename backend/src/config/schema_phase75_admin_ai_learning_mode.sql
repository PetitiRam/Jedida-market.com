-- Phase 75: Admin "Learning Mode" inside the Jedida AI Assistant widget.
ALTER TABLE ai_assistant_messages ADD COLUMN IF NOT EXISTS is_training BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_assistant_messages_training ON ai_assistant_messages(is_training) WHERE is_training = TRUE;
