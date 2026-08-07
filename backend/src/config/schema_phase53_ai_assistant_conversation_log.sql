-- Phase 53: AI Assistant widget conversation log + feedback/correction
-- source tracking.
--
-- The Jedida AI Assistant widget (JedidaAiWidget.jsx, served by
-- src/controllers/aiAssistantController.js) is a stateless, deterministic
-- keyword-matched chat — it was never backed by chat_conversations/
-- chat_messages (that table belongs to ChatV2, the buyer/seller/admin
-- messaging system). To let ai_conversation_feedback and
-- ai_answer_corrections (phase 49) reference an *exact* widget exchange —
-- not just "a rating happened at some point" — this phase gives the widget
-- its own lightweight, append-only conversation log.
--
-- This does NOT feed ChatV2 in any way and does NOT change the widget's
-- deterministic reply logic. It exists purely so a rating or a support
-- correction can point at the specific question and answer it was about.

CREATE TABLE IF NOT EXISTS ai_assistant_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audience          VARCHAR(10) NOT NULL CHECK (audience IN ('buyer', 'seller')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_conversations_user ON ai_assistant_conversations(user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS ai_assistant_messages (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id          UUID NOT NULL REFERENCES ai_assistant_conversations(id) ON DELETE CASCADE,
  role                     VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content                  TEXT NOT NULL,
  -- true when aiKnowledgeLookup.findPublishedAnswer supplied this reply,
  -- rather than a heuristic keyword match in jedidaAiAssistant.js — lets
  -- Performance Reports tell the two apart later if useful.
  answered_from_knowledge  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_messages_conversation ON ai_assistant_messages(conversation_id, created_at);

-- ai_conversation_feedback and ai_answer_corrections (phase 49) were built
-- against ChatV2's chat_conversations/chat_messages only. A rating or
-- correction can now come from either ChatV2 (a support agent reviewing an
-- escalated conversation) or the AI Assistant widget (a buyer/seller
-- rating a reply, tracked in the tables above) — so the strict single-
-- target foreign keys are relaxed to plain UUID columns with an explicit
-- `source` discriminator instead. Ownership/existence is checked in the
-- controller against the right table for that source rather than by the
-- database, since the id can point at either chat_messages or
-- ai_assistant_messages depending on `source`.
ALTER TABLE ai_conversation_feedback DROP CONSTRAINT IF EXISTS ai_conversation_feedback_conversation_id_fkey;
ALTER TABLE ai_conversation_feedback DROP CONSTRAINT IF EXISTS ai_conversation_feedback_message_id_fkey;
ALTER TABLE ai_conversation_feedback ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'chat_v2'
  CHECK (source IN ('chat_v2', 'assistant_widget'));

ALTER TABLE ai_answer_corrections DROP CONSTRAINT IF EXISTS ai_answer_corrections_conversation_id_fkey;
ALTER TABLE ai_answer_corrections DROP CONSTRAINT IF EXISTS ai_answer_corrections_message_id_fkey;
ALTER TABLE ai_answer_corrections ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'chat_v2'
  CHECK (source IN ('chat_v2', 'assistant_widget'));
