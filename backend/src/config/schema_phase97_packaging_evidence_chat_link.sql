-- Phase 97b: link packaging evidence back to the chat message that shared
-- it, when applicable.
--
-- Ports the one real, narrow capability from jedida-market-with-chat-
-- changes' separate order_packaging_evidence table (see
-- INTEGRATION_DECISION_REPORT.md section 6) into the canonical
-- packaging_evidence table adopted above, instead of keeping two tables
-- for what is otherwise the same permanent record.
--
-- The platform's chat messages auto-delete after 24 hours (see the
-- retention feature). A seller sharing a packaging photo through chat
-- needs that photo to remain as permanent order evidence independent of
-- the expiring message that announced it -- ON DELETE SET NULL means the
-- evidence row is never affected by the message's own deletion sweep.
ALTER TABLE packaging_evidence
  ADD COLUMN IF NOT EXISTS source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_packaging_evidence_source_message ON packaging_evidence(source_message_id) WHERE source_message_id IS NOT NULL;
