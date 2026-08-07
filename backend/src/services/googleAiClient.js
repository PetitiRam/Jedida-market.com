// Thin wrapper around the Google AI Studio (Gemini) generateContent API.
// https://ai.google.dev/api/generate-content
//
// One of two allowed LLM providers for this codebase (the other is Groq —
// see groqClient.js). Nothing else may be called for AI reasoning; see
// llmClient.js for the provider selection/fallback logic that bots should
// actually import.
//
// Uses GOOGLE_AI_STUDIO_API_KEY — deliberately separate from
// GOOGLE_CLIENT_ID / GOOGLE_SEARCH_API_KEY, which power unrelated Google
// integrations (Sign in with Google, Colline's image search) elsewhere in
// this codebase.

const MODEL = process.env.GOOGLE_AI_STUDIO_MODEL || 'gemini-2.0-flash';
const API_URL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GOOGLE_AI_STUDIO_API_KEY}`;

export function isGoogleAiConfigured() {
  return Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY);
}

/**
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} [opts] - { maxTokens }
 * @returns {Promise<string>} the model's text response
 */
export async function askGoogleAi(systemPrompt, userMessage, opts = {}) {
  if (!isGoogleAiConfigured()) {
    throw new Error('GOOGLE_AI_STUDIO_API_KEY is not configured.');
  }

  const res = await fetch(API_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens || 1024 }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google AI Studio API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('') || '';
}
