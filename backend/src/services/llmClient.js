// Single entry point for real LLM reasoning in this codebase. Every AI
// "bot" (Nsubuga Joseph, Colline, PETITI, TAUSI) currently uses
// deterministic heuristics so the platform works end-to-end without any
// API key. Call `askLLM()` from any bot to upgrade it to genuine LLM
// reasoning; when neither provider is configured, callers should catch the
// thrown error and fall back to their deterministic logic (see
// nsubugaJosephBot.js for the reference pattern).
//
// The ONLY two providers wired into this codebase are Groq and Google AI
// Studio (Gemini) — see groqClient.js / googleAiClient.js. Do not add any
// other LLM provider here. Groq is tried first (fast + generous free
// tier); Google AI Studio is the fallback if Groq is unconfigured or
// errors out. Set LLM_PROVIDER=google to force Google AI Studio first
// instead.

import { askGroq, isGroqConfigured } from './groqClient.js';
import { askGoogleAi, isGoogleAiConfigured } from './googleAiClient.js';

export function isLLMConfigured() {
  return isGroqConfigured() || isGoogleAiConfigured();
}

function providerOrder() {
  const preferred = process.env.LLM_PROVIDER === 'google' ? 'google' : 'groq';
  const providers = [
    { name: 'groq', ask: askGroq, configured: isGroqConfigured },
    { name: 'google', ask: askGoogleAi, configured: isGoogleAiConfigured }
  ];
  return preferred === 'google' ? providers.reverse() : providers;
}

/**
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} [opts] - { maxTokens }
 * @returns {Promise<string>} the model's text response
 */
export async function askLLM(systemPrompt, userMessage, opts = {}) {
  const candidates = providerOrder().filter((p) => p.configured());
  if (candidates.length === 0) {
    throw new Error('No LLM provider configured. Set GROQ_API_KEY and/or GOOGLE_AI_STUDIO_API_KEY.');
  }

  let lastErr;
  for (const provider of candidates) {
    try {
      return await provider.ask(systemPrompt, userMessage, opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Same as askLLM but parses the response as JSON. Instructs the model to
 * return only JSON, and throws if parsing fails so callers can fall back.
 */
export async function askLLMForJson(systemPrompt, userMessage, opts = {}) {
  const strictSystem = `${systemPrompt}\n\nRespond with ONLY valid JSON. No markdown fences, no preamble, no explanation.`;
  const text = await askLLM(strictSystem, userMessage, opts);
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
