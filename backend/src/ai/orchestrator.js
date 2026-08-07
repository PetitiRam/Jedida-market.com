// Jedida AI Orchestrator — local NLU version.
//
// No external API calls and no LLM of any kind (hosted or self-hosted).
// "Understanding" here comes entirely from backend/src/ai/nlu/:
//   - classifier.js: TF-IDF + cosine similarity intent classification,
//     trained once from corpus.js's paraphrase examples — this is what
//     lets "create a quotation" / "I need a quotation" / "generate a
//     quote" all resolve to the same intent without exact phrase matching.
//   - tokenize.js: typo-tolerant tokenization (Levenshtein correction
//     against the known vocabulary) — handles spelling mistakes.
//   - emotion.js: lexicon-based tone detection, used to prepend a genuine
//     empathy opener rather than answering flatly.
//   - respond.js: turns a classification into an actual reply, including
//     asking a clarifying question when two intents score close together
//     instead of guessing.
//
// Governance carried over unchanged from the prior version of this file:
//   - identity questions still resolve through jedidaIdentity.js first,
//     unconditionally.
//   - published knowledge (aiKnowledgeLookup.js) is still consulted and
//     still wins over a guess when nothing in the corpus matches
//     confidently.
//   - when neither the local classifier nor Jedida's own knowledge base
//     has an answer, a Google-grounded research lookup (research.js) is
//     tried as a last resort — the ONLY external API call anywhere in
//     this pipeline, used strictly for answering/research (general
//     knowledge questions), never for marketplace intents and never for
//     taking any action. See research.js for why it's scoped this way.
//   - shopAiMemory is surfaced as a light aside, never fabricated.
//   - this module drafts replies only — no tool calls, no actions. That's
//     unchanged from the plan in jedida_ai_architecture.md; it was never
//     dependent on which reasoning engine sits underneath.
//
// jedidaAiAssistant.js (the original hand-written regex bot) is kept as
// the last-resort fallback if this pipeline throws for any reason — two
// independent rule-based systems are cheap insurance against a bug in
// either one taking the whole assistant down.

import { getAssistantReply } from '../services/jedidaAiAssistant.js';
import { shouldAnswerIdentity, getIdentityReply } from '../services/jedidaIdentity.js';
import { memoryDigest } from '../services/shopAiMemory.js';
import { findPublishedAnswer } from '../services/aiKnowledgeLookup.js';
import { classify } from './nlu/classifier.js';
import { detectEmotion } from './nlu/emotion.js';
import { buildReply } from './nlu/respond.js';
import { researchAnswer } from './research.js';

/**
 * @param {object} params
 * @param {string} params.message
 * @param {boolean} [params.deepMode] - currently unused by the local pipeline (no long-form generation to expand); kept in the signature for API compatibility with the controller and future phases
 * @param {string|null} [params.shopContext]
 * @param {string|null} [params.shopId]
 * @param {'buyer'|'seller'} params.audience
 * @param {Array<{role: 'user'|'assistant', content: string}>} [params.history] - accepted for API compatibility; not yet used by the local classifier (see note below)
 * @returns {Promise<{reply: string, source: string, usedLLM: false, answeredFromKnowledge: boolean}>}
 */
export async function getOrchestratedReply({ message, deepMode, shopContext, shopId, audience, history = [] }) {
  if (shouldAnswerIdentity(message)) {
    return { reply: getIdentityReply(), source: 'identity', usedLLM: false, answeredFromKnowledge: false };
  }

  const resolvedAudience = audience === 'buyer' ? 'buyer' : 'seller';

  try {
    const classification = classify(message, resolvedAudience);
    const emotionResult = detectEmotion(message);

    let memory = '';
    if (resolvedAudience === 'seller' && shopId) {
      try {
        memory = await memoryDigest(shopId);
      } catch {
        // best-effort — see shopAiMemory.js
      }
    }

    // Only spend a DB lookup on the knowledge base when the corpus itself
    // wasn't confident — a confident intent match already has a good
    // answer, no need to also search.
    let knowledge = null;
    if (!classification.confident) {
      try {
        knowledge = await findPublishedAnswer(message);
      } catch {
        // best-effort
      }
    }

    if (knowledge) {
      return {
        reply: `${knowledge.excerpt}\n\n(From: ${knowledge.title})`,
        source: 'knowledge_base',
        usedLLM: false,
        answeredFromKnowledge: true,
      };
    }

    // Last resort, and only reached when both the local classifier and
    // Jedida's own knowledge base had nothing — this is the sole external
    // API call in the whole pipeline, scoped strictly to answering a
    // general-knowledge/research question, never to marketplace intents.
    if (!classification.confident) {
      let research = null;
      try {
        research = await researchAnswer(message);
      } catch {
        // best-effort — falls through to the normal default reply below
      }
      if (research) {
        return { reply: research.reply, source: 'google_research', usedLLM: false, answeredFromKnowledge: false };
      }
    }

    const { reply, matchedIntent, askedClarifying } = buildReply({
      message,
      audience: resolvedAudience,
      classification,
      emotionResult,
      shopContext,
      memory,
    });

    const source = askedClarifying ? 'nlu_clarifying' : matchedIntent ? 'nlu_matched' : 'nlu_fallback';
    return { reply, source, usedLLM: false, answeredFromKnowledge: false };
  } catch (err) {
    console.error('Orchestrator: local NLU pipeline failed, falling back to hand-written regex bot:', err.message);
    const reply = await getAssistantReply({ message, deepMode, shopContext, audience: resolvedAudience });
    return { reply, source: 'heuristic_fallback_error', usedLLM: false, answeredFromKnowledge: false };
  }
}
