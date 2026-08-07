// Google-grounded research fallback.
//
// This is the ONE place in the whole AI ecosystem that calls an external
// API — and only for answering general-knowledge / research questions
// that neither the local NLU classifier (marketplace-specific intents)
// nor Jedida's own published knowledge base could answer. It is never
// used for marketplace intents (those stay 100% local — see corpus.js),
// never used to take any action, and never treated as more authoritative
// than Jedida's own knowledge base or account data.
//
// Reuses the Google Custom Search integration that already exists in this
// codebase (googleSearchService.js, GOOGLE_SEARCH_API_KEY +
// GOOGLE_SEARCH_ENGINE_ID) rather than standing up a second Google client
// or a different search provider.

import { googleSearch } from '../services/googleSearchService.js';
import { isGoogleSearchConfigured } from '../services/googleClient.js';

const MAX_RESULTS = 3;
// Keep results skimmable rather than full-article length — this is meant
// to read like a short set of pointers, not a reproduction of the source.
const MAX_SNIPPET_CHARS = 220;

function trimSnippet(snippet) {
  const s = String(snippet || '').trim();
  if (s.length <= MAX_SNIPPET_CHARS) return s;
  return `${s.slice(0, MAX_SNIPPET_CHARS).trim()}…`;
}

export function isResearchAvailable() {
  return isGoogleSearchConfigured();
}

/**
 * @param {string} query
 * @returns {Promise<{reply: string, resultCount: number} | null>} null when unconfigured, the search failed, or there were no results — callers should fall through to the normal default reply in that case, never surface a raw error.
 */
export async function researchAnswer(query) {
  if (!isGoogleSearchConfigured()) return null;

  let results = [];
  try {
    results = await googleSearch(query); // googleSearchService.js already swallows its own errors and returns []
  } catch {
    return null;
  }
  if (!results.length) return null;

  const top = results.slice(0, MAX_RESULTS);
  const lines = top.map((r) => `• ${r.title} — ${trimSnippet(r.snippet)} (${r.link})`);

  const reply = [
    "I couldn't find that in Jedida's own help content, but here's what turned up researching it:",
    '',
    ...lines,
    '',
    "That's from a general web search, not Jedida's own policies or your account data — worth checking anything account- or order-specific directly in My Orders or with Support.",
  ].join('\n');

  return { reply, resultCount: results.length };
}
