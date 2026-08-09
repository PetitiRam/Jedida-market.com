// Jedida AI — real LLM-backed conversation path.

import { isLLMConfigured, askLLM } from '../services/llmClient.js';
import { buildPersonaSystemPrompt } from './persona.js';

const ESCALATE_TOKEN = '[[ESCALATE]]';
const MAX_HISTORY_TURNS = 8;

export function isConversationalLLMAvailable() {
  return isLLMConfigured();
}

function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const recent = history.slice(-MAX_HISTORY_TURNS);
  return recent.map((turn) => `${turn.role === 'user' ? 'User' : 'Jedida'}: ${turn.content}`).join('\n');
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {'buyer'|'seller'} params.audience
 * @param {Array<{role:'user'|'assistant', content:string}>} [params.history]
 * @param {string|null} [params.shopContext]
 * @param {string|null} [params.memory]
 * @param {string|null} [params.knowledgeExcerpt]
 * @param {string|null} [params.classifierHint]
 * @param {string|null} [params.correctionLessons]
 * @returns {Promise<{reply: string, needsHuman: boolean}|null>}
 */
export async function getConversationalReply({ message, audience, history = [], shopContext, memory, knowledgeExcerpt, classifierHint, correctionLessons }) {
  if (!isLLMConfigured()) return null;

  const systemPrompt = buildPersonaSystemPrompt({ audience, shopContext, memory, knowledgeExcerpt, classifierHint, correctionLessons });
  const historyText = formatHistory(history);
  const userMessage = historyText
    ? `Conversation so far:\n${historyText}\n\nUser: ${message}`
    : `User: ${message}`;

  let raw;
  try {
    raw = await askLLM(systemPrompt, userMessage, { maxTokens: 500 });
  } catch (err) {
    console.error('Jedida LLM conversation error, falling back to local NLU:', err.message);
    return null;
  }

  if (!raw || !raw.trim()) return null;

  const needsHuman = raw.includes(ESCALATE_TOKEN);
  const reply = raw.replace(ESCALATE_TOKEN, '').trim();
  if (!reply) return null;

  return { reply, needsHuman };
}
