// Thin wrapper around Groq's OpenAI-compatible chat completions API.
// https://console.groq.com/docs/api-reference#chat-create
//
// One of two allowed LLM providers for this codebase (the other is Google
// AI Studio — see googleAiClient.js). Nothing else may be called for AI
// reasoning; see llmClient.js for the provider selection/fallback logic
// that bots should actually import.

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} [opts] - { maxTokens }
 * @returns {Promise<string>} the model's text response
 */
export async function askGroq(systemPrompt, userMessage, opts = {}) {
  if (!isGroqConfigured()) {
    throw new Error('GROQ_API_KEY is not configured.');
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens || 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
