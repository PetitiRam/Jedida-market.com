// Builds the actual reply text from a classification result. No
// generation happens here — every word traces back to a template in
// corpus.js — but which template, whether an empathy opener is prepended,
// and whether a clarifying question is asked instead of an answer are all
// decided per-message, so two people asking about "my order" don't
// necessarily get byte-identical replies, and a low-confidence match
// doesn't get forced into the wrong answer.

import { INTENTS, SHARED_INTENTS } from './corpus.js';
import { EMPATHY_OPENERS } from './emotion.js';

const CLOSE_SCORE_MARGIN = 0.05; // if #2 is within this of #1, treat as genuinely ambiguous

function findIntentDef(intentId, audience) {
  const inAudience = (INTENTS[audience] || []).find((i) => i.id === intentId);
  if (inAudience) return inAudience;
  const shared = SHARED_INTENTS.find((i) => i.id === intentId);
  return shared || null;
}

// Deterministic-but-varied template pick: hashes the message so the same
// exact message always gets the same reply (useful for testing/support
// review) while different messages hitting the same intent see different
// phrasing, rather than everyone getting templates[0] forever.
function pickTemplate(templates, message) {
  const list = Array.isArray(templates) ? templates : [templates];
  if (list.length === 1) return list[0];
  let hash = 0;
  for (let i = 0; i < message.length; i++) hash = (hash * 31 + message.charCodeAt(i)) >>> 0;
  return list[hash % list.length];
}

function fillTemplate(template, { agent, section, context }) {
  return template
    .replace(/\{agent\}/g, agent || '')
    .replace(/\{section\}/g, section || '')
    .replace(/\{context\}/g, context ? `\n\n(Looking at ${context})` : '');
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {'buyer'|'seller'} params.audience
 * @param {ReturnType<typeof import('./classifier.js').classify>} params.classification
 * @param {{emotion: string, confident: boolean}} params.emotionResult
 * @param {string|null} params.shopContext
 * @param {string|null} params.memory - shopAiMemory digest, appended as a light aside, never fabricated content
 * @returns {{ reply: string, matchedIntent: string|null, askedClarifying: boolean }}
 */
export function buildReply({ message, audience, classification, emotionResult, shopContext, memory }) {
  const opener = emotionResult?.confident && EMPATHY_OPENERS[emotionResult.emotion]
    ? `${EMPATHY_OPENERS[emotionResult.emotion]} `
    : '';

  // Genuinely ambiguous between two well-scoring intents — ask which,
  // rather than guessing. This is the concrete version of "if not enough
  // information is available, ask intelligent follow-up questions."
  const [top, second] = classification.ranked;
  if (classification.confident && second && (top.score - second.score) < CLOSE_SCORE_MARGIN && second.score > 0.08) {
    const topDef = findIntentDef(top.intentId, audience);
    const secondDef = findIntentDef(second.intentId, audience);
    const topLabel = topDef?.section || topDef?.id || top.intentId;
    const secondLabel = secondDef?.section || secondDef?.id || second.intentId;
    return {
      reply: `${opener}I want to point you the right way — are you asking about ${topLabel.replace(' section', '').toLowerCase()} or ${secondLabel.replace(' section', '').toLowerCase()}?`,
      matchedIntent: null,
      askedClarifying: true,
    };
  }

  if (!classification.confident || !classification.intentId) {
    const fallback = audience === 'buyer'
      ? "I can help with order tracking, returns and refunds, payments, or finding a product — tell me a bit more about what you need."
      : "I can help with storefront design, product reviews, marketing copy, shop analytics, or security questions — tell me a bit more about what you're trying to do and I'll point you to the right teammate.";
    return { reply: `${opener}${fallback}`, matchedIntent: null, askedClarifying: false };
  }

  const intentDef = findIntentDef(classification.intentId, audience);
  if (!intentDef) {
    return { reply: `${opener}Tell me a bit more about what you need and I'll point you the right way.`, matchedIntent: null, askedClarifying: false };
  }

  const templates = intentDef.templates?.[audience] || intentDef.templates;
  const template = pickTemplate(templates, message);
  let reply = fillTemplate(template, { agent: intentDef.agent, section: intentDef.section, context: shopContext });

  if (memory) reply += `\n\n(Also worth knowing: ${memory.split('\n')[0].replace(/^- \(\w+\)\s*/, '')})`;

  return { reply: `${opener}${reply}`, matchedIntent: classification.intentId, askedClarifying: false };
}
