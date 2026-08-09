// Jedida AI Orchestrator.

import { getAssistantReply } from '../services/jedidaAiAssistant.js';
import { shouldAnswerIdentity, getIdentityReply } from '../services/jedidaIdentity.js';
import { memoryDigest } from '../services/shopAiMemory.js';
import { findPublishedAnswer } from '../services/aiKnowledgeLookup.js';
import { classify } from './nlu/classifier.js';
import { detectEmotion } from './nlu/emotion.js';
import { buildReply } from './nlu/respond.js';
import { researchAnswer } from './research.js';
import { getConversationalReply, isConversationalLLMAvailable } from './llmConversation.js';
import { getApprovedCorrectionLessons } from '../services/aiCorrectionsMemory.js';

/**
 * @param {object} params
 * @param {string} params.message
 * @param {boolean} [params.deepMode]
 * @param {string|null} [params.shopContext]
 * @param {string|null} [params.shopId]
 * @param {'buyer'|'seller'} params.audience
 * @param {Array<{role: 'user'|'assistant', content: string}>} [params.history]
 * @returns {Promise<{reply: string, source: string, usedLLM: boolean, answeredFromKnowledge: boolean, needsHuman: boolean}>}
 */
export async function getOrchestratedReply({ message, deepMode, shopContext, shopId, audience, history = [] }) {
  if (shouldAnswerIdentity(message)) {
    return { reply: getIdentityReply(), source: 'identity', usedLLM: false, answeredFromKnowledge: false, needsHuman: false };
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

    let knowledge = null;
    if (!classification.confident) {
      try {
        knowledge = await findPublishedAnswer(message);
      } catch {
        // best-effort
      }
    }

    if (isConversationalLLMAvailable()) {
      let correctionLessons = null;
      try {
        correctionLessons = await getApprovedCorrectionLessons();
      } catch {
        // best-effort — see aiCorrectionsMemory.js
      }
      const llmResult = await getConversationalReply({
        message,
        audience: resolvedAudience,
        history,
        shopContext,
        memory: memory || null,
        knowledgeExcerpt: knowledge ? `${knowledge.title}: ${knowledge.excerpt}` : null,
        classifierHint: classification.confident ? classification.intentId : null,
        correctionLessons,
      });
      if (llmResult) {
        return {
          reply: llmResult.reply,
          source: 'llm_conversation',
          usedLLM: true,
          answeredFromKnowledge: Boolean(knowledge),
          needsHuman: llmResult.needsHuman,
        };
      }
    }

    if (knowledge) {
      return {
        reply: `${knowledge.excerpt}\n\n(From: ${knowledge.title})`,
        source: 'knowledge_base',
        usedLLM: false,
        answeredFromKnowledge: true,
        needsHuman: false,
      };
    }

    if (!classification.confident) {
      let research = null;
      try {
        research = await researchAnswer(message);
      } catch {
        // best-effort
      }
      if (research) {
        return { reply: research.reply, source: 'google_research', usedLLM: false, answeredFromKnowledge: false, needsHuman: false };
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
    return { reply, source, usedLLM: false, answeredFromKnowledge: false, needsHuman: false };
  } catch (err) {
    console.error('Orchestrator: pipeline failed, falling back to hand-written regex bot:', err.message);
    const reply = await getAssistantReply({ message, deepMode, shopContext, audience: resolvedAudience });
    return { reply, source: 'heuristic_fallback_error', usedLLM: false, answeredFromKnowledge: false, needsHuman: false };
  }
}
