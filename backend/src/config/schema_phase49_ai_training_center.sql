-- Phase 49: Jedida AI Training Center.
--
-- Extends the existing Jedida AI Assistant (src/services/jedidaAiAssistant.js,
-- phase 39) with a controlled knowledge base it can draw on — it does NOT
-- replace the assistant's deterministic reply logic. See
-- src/services/aiKnowledgeLookup.js for how the assistant consults this data.
--
-- Every fact the AI can use passes through a fixed pipeline:
--   Draft -> Review -> Admin Approval -> AI Indexing -> Published (available to AI)
-- Nothing reaches the AI automatically. There is no code path anywhere in
-- this phase that copies chat_messages content, payment data, KYC/identity
-- documents, or any other private record straight into a knowledge item —
-- every row is either typed by an admin/business owner/support agent, or an
-- uploaded document a human explicitly submitted for review.

-- Fixed set of specialist collections the dashboard and knowledge library
-- filter by. Kept as a CHECK constraint (not a lookup table) to match how
-- fixed vocabularies are modelled elsewhere in this schema (e.g. document
-- status, dispute status).
--   general_marketplace | agriculture | manufacturing | suppliers |
--   wholesale | delivery | payments | seller_success | buyer_support |
--   admin_operations

CREATE TABLE IF NOT EXISTS ai_knowledge_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               VARCHAR(200) NOT NULL,
  collection          VARCHAR(30) NOT NULL CHECK (collection IN (
                        'general_marketplace','agriculture','manufacturing','suppliers',
                        'wholesale','delivery','payments','seller_success','buyer_support',
                        'admin_operations'
                      )),
  source_type         VARCHAR(30) NOT NULL DEFAULT 'help_article' CHECK (source_type IN (
                        'help_article','documentation','product_catalog','policy','faq',
                        'training_manual','seller_guide','agriculture_knowledge',
                        'wholesale_doc','delivery_procedure','support_correction','other'
                      )),
  content             TEXT NOT NULL DEFAULT '',
  file_url            TEXT,
  file_type           VARCHAR(20),          -- 'pdf' | 'docx' | 'xlsx' | 'image' | null (text-only)
  tags                TEXT[] NOT NULL DEFAULT '{}',

  status              VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft','in_review','approved','rejected','indexed','published','archived'
                      )),
  security_flags      TEXT[] NOT NULL DEFAULT '{}', -- reasons aiKnowledgeGuard blocked a transition, kept for audit even after fixed
  rejection_reason    TEXT,

  version             INTEGER NOT NULL DEFAULT 1,
  is_current          BOOLEAN NOT NULL DEFAULT TRUE,
  previous_version_id UUID REFERENCES ai_knowledge_items(id),

  submitted_by        UUID NOT NULL REFERENCES users(id),
  reviewed_by         UUID REFERENCES users(id),
  approved_by         UUID REFERENCES users(id),
  published_by        UUID REFERENCES users(id),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  archived_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_status ON ai_knowledge_items(status, collection);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_collection ON ai_knowledge_items(collection) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_current ON ai_knowledge_items(is_current) WHERE is_current = TRUE;

-- Lightweight full-text search over what the AI is actually allowed to use.
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_search
  ON ai_knowledge_items USING GIN (to_tsvector('english', title || ' ' || content))
  WHERE status = 'published';

-- Suggestions submitted by business owners (product/business FAQs) or
-- support staff (frequently-asked questions worth formalizing). Distinct
-- from ai_answer_corrections below, which corrects a specific AI reply.
CREATE TABLE IF NOT EXISTS ai_knowledge_suggestions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_by        UUID NOT NULL REFERENCES users(id),
  suggested_by_role   VARCHAR(20) NOT NULL DEFAULT 'business_owner' CHECK (suggested_by_role IN (
                        'business_owner','support','admin'
                      )),
  collection          VARCHAR(30) NOT NULL CHECK (collection IN (
                        'general_marketplace','agriculture','manufacturing','suppliers',
                        'wholesale','delivery','payments','seller_success','buyer_support',
                        'admin_operations'
                      )),
  question            TEXT NOT NULL,
  suggested_answer    TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by         UUID REFERENCES users(id),
  review_notes        TEXT,
  resulting_knowledge_item_id UUID REFERENCES ai_knowledge_items(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_knowledge_suggestions(status, created_at DESC);

-- A support agent's correction to a specific AI reply. `original_answer`
-- is a short excerpt of what the AI said (not the buyer/seller's private
-- message), `corrected_answer` is written fresh by the agent — this table
-- never stores the other party's raw chat content.
CREATE TABLE IF NOT EXISTS ai_answer_corrections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  message_id          UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  original_answer     TEXT,
  corrected_answer     TEXT NOT NULL,
  collection          VARCHAR(30) CHECK (collection IN (
                        'general_marketplace','agriculture','manufacturing','suppliers',
                        'wholesale','delivery','payments','seller_success','buyer_support',
                        'admin_operations'
                      )),
  submitted_by        UUID NOT NULL REFERENCES users(id),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by         UUID REFERENCES users(id),
  review_notes        TEXT,
  resulting_knowledge_item_id UUID REFERENCES ai_knowledge_items(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_corrections_status ON ai_answer_corrections(status, created_at DESC);

-- Buyer/seller thumbs-up / thumbs-down on an AI reply. Ratings feed
-- Performance Reports; they are never themselves training data (a low
-- rating alone never changes what the AI knows — it can only prompt a
-- human to file a correction or suggestion, which then goes through the
-- normal approval workflow).
CREATE TABLE IF NOT EXISTS ai_conversation_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  message_id          UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  user_id             UUID NOT NULL REFERENCES users(id),
  rating              VARCHAR(15) NOT NULL CHECK (rating IN ('helpful','not_helpful')),
  comment             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_rating ON ai_conversation_feedback(rating, created_at DESC);

-- Topics the AI could not answer well — either flagged by a human (admin/
-- support) or logged when the assistant falls through to its generic
-- default reply. Surfaces in the "Suggested Knowledge" / knowledge-gap
-- section so admins know what to write next; never auto-resolved.
CREATE TABLE IF NOT EXISTS ai_knowledge_gaps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic               VARCHAR(200) NOT NULL,
  sample_question     TEXT,
  collection_guess    VARCHAR(30) CHECK (collection_guess IN (
                        'general_marketplace','agriculture','manufacturing','suppliers',
                        'wholesale','delivery','payments','seller_success','buyer_support',
                        'admin_operations'
                      )),
  frequency_count     INTEGER NOT NULL DEFAULT 1,
  status              VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed','dismissed')),
  resulting_knowledge_item_id UUID REFERENCES ai_knowledge_items(id),
  flagged_by          UUID REFERENCES users(id), -- null when logged automatically by the assistant fallback
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_gaps_status ON ai_knowledge_gaps(status, frequency_count DESC);

-- One row per batch of knowledge an admin sends through indexing. This is
-- the "AI Learning Jobs" list — it only ever operates on knowledge items
-- already in status = 'approved', and moves them to 'indexed' then
-- 'published'. There is no scheduled/automatic job; every job is admin-
-- triggered (see aiTrainingController.createTrainingJob).
CREATE TABLE IF NOT EXISTS ai_training_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(200) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed')),
  triggered_by        UUID NOT NULL REFERENCES users(id),
  item_count          INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_training_jobs_started ON ai_training_jobs(started_at DESC);

CREATE TABLE IF NOT EXISTS ai_training_job_items (
  job_id              UUID NOT NULL REFERENCES ai_training_jobs(id) ON DELETE CASCADE,
  knowledge_item_id   UUID NOT NULL REFERENCES ai_knowledge_items(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, knowledge_item_id)
);
