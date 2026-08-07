# Jedida AI Training Center — Stage Report (Phase 49)

## What this stage adds

A controlled AI Training Center that lets the **existing** Jedida AI
Commerce Assistant (`src/services/jedidaAiAssistant.js`, phase 39) improve
over time using approved marketplace knowledge — without replacing its
deterministic reply logic and without ever learning automatically from
private or sensitive data.

Nothing in this stage changes how the assistant's keyword-matched replies
work. It only adds a fallback: when the assistant would otherwise give its
generic default answer, it now also checks the published knowledge base
first (`src/services/aiKnowledgeLookup.js`).

## Pipeline

Every fact the AI can use passes through the same fixed workflow, with no
shortcuts:

```
Draft → Review → Admin Approval → AI Indexing → Published (available to AI)
```

Knowledge reaches Draft one of three ways, all requiring a named human
author:
1. An admin creates it directly in the Knowledge Library (text, or an
   uploaded PDF/Word/Excel/image with a description).
2. A business owner submits a suggested FAQ/product-knowledge item →
   admin approves it → it becomes a Draft, already at "Approved" once
   accepted (still requires the training-job step to publish).
3. A support agent corrects a specific AI reply → admin approves it → same
   as above.

At every transition into Review or Approved, `aiKnowledgeGuard.js` scans
the content for card numbers, password/API-key patterns, private-key
material, ID/account-number patterns, and a short list of harmful-intent
keywords. Flagged content is blocked from advancing until an admin edits
it — this is a safety net on top of admin review, not a substitute for it.

## New backend files

| File | Purpose |
|---|---|
| `src/config/schema_phase49_ai_training_center.sql` | New tables: `ai_knowledge_items`, `ai_knowledge_suggestions`, `ai_answer_corrections`, `ai_conversation_feedback`, `ai_knowledge_gaps`, `ai_training_jobs` + `ai_training_job_items`. Fixed collection vocabulary via CHECK constraints (general_marketplace, agriculture, manufacturing, suppliers, wholesale, delivery, payments, seller_success, buyer_support, admin_operations). |
| `src/services/aiKnowledgeGuard.js` | Pattern-based content scanner; also exports the allowed collection/source-type vocabularies. |
| `src/services/aiKnowledgeLookup.js` | Read-only bridge from `published` knowledge into the assistant's reply flow; logs knowledge gaps when nothing matches. |
| `src/controllers/aiTrainingController.js` | Admin-only: knowledge CRUD, review/approve/reject, versioning, archive, file upload, training jobs, pending-approval queue, knowledge gaps, published list, performance report. |
| `src/controllers/aiTrainingContributionsController.js` | Non-admin: submit suggestion, list own suggestions, submit correction, submit feedback. |
| `src/routes/adminAiTraining.js` | Mounted at `/api/admin/ai-training`, gated by the existing `requirePermission('ai')` (same area `ai_manager` already has). |
| `src/routes/aiTraining.js` | Mounted at `/api/ai-training`; suggestions/feedback open to any signed-in user, corrections gated to `requirePermission('chat')` (support/chat_assistant/security_agent/business_rep/super admin). |

## Modified backend files

- `src/server.js` — imports and mounts the two new route files.
- `src/controllers/aiAssistantController.js` — after the deterministic
  assistant falls through to its generic default reply, additively checks
  published knowledge (`findPublishedAnswer`) before replying, and logs a
  knowledge gap (`logKnowledgeGap`) if nothing matched either. A real
  keyword match in the existing assistant is never overridden.

## New frontend files

- `src/api/adminAiTrainingApi.js`, `src/api/aiTrainingApi.js` — API clients.
- `src/pages/admin/AdminAiTrainingCenter.jsx` — the Admin Training Center
  dashboard: Knowledge Library, AI Learning Jobs, Training History,
  Suggested Knowledge, Pending Approval, Published Knowledge, Performance
  Reports.

## Modified frontend files

- `src/pages/admin/AdminPanel.jsx` — new "🎓 AI Training Center" tab
  (area: `ai`, same as AI Command Center).
- `src/pages/seller/AIAssistantHubPanel.jsx` — new "Suggest knowledge for
  the AI Training Center" section for business owners.
- `src/components/ai-assistant/JedidaAiWidget.jsx` — the existing
  thumbs-up/down buttons now submit real feedback to
  `POST /ai-training/feedback`.

## Role permissions

| Role | Can do |
|---|---|
| Admin (`ai_manager` sub-role or super admin) | Everything under `/api/admin/ai-training/*` — approve training, manage knowledge, review performance. |
| Business owner (any signed-in seller/manufacturer/supplier) | Submit FAQs/product knowledge suggestions, view their own submission status. |
| Support staff (`support`, `chat_assistant`, `security_agent`, `business_rep` sub-roles) | Submit answer corrections for admin review. |
| Any signed-in user | Rate an AI reply helpful / not helpful. |

## Security guarantees

- No endpoint copies `chat_messages` content, payment records, KYC/identity
  documents, or wallet data into a knowledge row. Corrections store only a
  short excerpt of what the AI said, typed manually by the support agent.
- The AI's runtime lookup (`aiKnowledgeLookup.js`) only ever reads rows
  where `status = 'published'` — the terminal state of the approval
  pipeline. There is no code path that lets a draft, in-review, or rejected
  item reach the assistant.
- Every publish action is admin-triggered (`createTrainingJob`); there is
  no scheduled or automatic job.

## Known follow-ups (not built in this stage)

- The `ai_conversation_feedback` / `ai_answer_corrections` tables accept a
  `conversationId`/`messageId`, but `JedidaAiWidget.jsx` doesn't currently
  track chat-v2 conversation/message IDs (it's a stateless deterministic
  chat, not backed by `chat_conversations`), so feedback is recorded
  without that link. Wiring it through would let Performance Reports and
  corrections reference the exact exchange.
- No automated tests were added for the new endpoints — this project has
  no existing backend test suite to extend, and running one wasn't
  possible in this environment (network access disabled, dependencies not
  installable).
- JSX changes were syntax-reasoned by hand; `node --check` was run against
  all new backend JS (all passed), but no bundler was available offline to
  lint the new/modified frontend files. Run your normal `npm run build`
  before deploying.

## Merge note — Developer Platform snapshot (phase 51 upload)

This project was reconciled with an externally-updated snapshot
(`JedidaMarket_DeveloperPlatform_Phase51_updated.zip`) that had branched
from this stage right after phase 49 (AI Training Center) and, in
parallel, added several other completed phases: chat moderation upgrade,
wallet/escrow hardening, mobile chat push, a database audit, the PETITI
autonomous security response engine (phase 52), and the Developer Platform
+ API Keys Sandbox (phases 50–51) that gives the zip its name. See the
other `*_REPORT.md` files at the project root for those.

That snapshot was missing this project's phase-50 AI Assistant
conversation log (the widget conversation/message tracking that lets
thumbs-up/down and support corrections reference an exact exchange — see
the "Phase 50" section above). It was re-applied on top of the snapshot
and renumbered to **phase 53** (`schema_phase53_ai_assistant_conversation_log.sql`)
to avoid colliding with the snapshot's own phase 50–52 files. No other
content changed — the five files phase 50 touched
(`aiAssistantController.js`, `aiTrainingContributionsController.js`,
`aiTrainingController.js`, `aiAssistantApi.js`, `JedidaAiWidget.jsx`) were
confirmed to be clean supersets of the snapshot's versions before being
restored, so nothing from the Developer Platform / PETITI / chat
moderation work was overwritten.
