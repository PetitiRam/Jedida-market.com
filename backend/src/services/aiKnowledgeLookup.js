// Bridges the AI Training Center's approved knowledge base into the
// existing Jedida AI Assistant (jedidaAiAssistant.js). This module ONLY
// reads rows where status = 'published' — the far end of the
// Draft -> Review -> Admin Approval -> AI Indexing -> Published pipeline —
// so nothing unapproved can ever surface here. It never modifies the
// assistant's existing keyword-matched replies; callers use it as a
// fallback when nothing else matched.

import { query } from '../config/db.js';

// Very small stopword list — good enough for picking out the meaningful
// words in a short chat message without pulling in a dependency.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can',
  'could', 'would', 'should', 'i', 'you', 'my', 'me', 'to', 'for', 'of',
  'in', 'on', 'at', 'and', 'or', 'it', 'this', 'that', 'how', 'what',
  'when', 'where', 'why', 'about', 'with', 'have', 'has', 'not',
]);

function keywordsFrom(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 8);
}

/**
 * Looks for the best-matching published knowledge item for a message.
 * Returns { title, excerpt } or null. Best-effort — any DB error just
 * means no knowledge-base answer, the caller's normal fallback still runs.
 */
export async function findPublishedAnswer(message) {
  const words = keywordsFrom(message);
  if (words.length === 0) return null;

  try {
    const tsQuery = words.join(' | ');
    const result = await query(
      `SELECT title, content
       FROM ai_knowledge_items
       WHERE status = 'published' AND is_current = TRUE
         AND to_tsvector('english', title || ' ' || content) @@ to_tsquery('english', $1)
       ORDER BY ts_rank(to_tsvector('english', title || ' ' || content), to_tsquery('english', $1)) DESC
       LIMIT 1`,
      [tsQuery]
    );
    const hit = result.rows[0];
    if (!hit) return null;
    const excerpt = hit.content.length > 400 ? `${hit.content.slice(0, 400)}…` : hit.content;
    return { title: hit.title, excerpt };
  } catch {
    return null;
  }
}

// Logs a topic the assistant couldn't answer, so it shows up in the
// Training Center's "Suggested Knowledge" queue for an admin to review.
// Never creates knowledge itself — just a signal for a human to act on.
export async function logKnowledgeGap(message, collectionGuess = null) {
  try {
    const topic = String(message || '').slice(0, 200).trim();
    if (!topic) return;
    const existing = await query(
      `SELECT id FROM ai_knowledge_gaps WHERE topic = $1 AND status = 'open' LIMIT 1`,
      [topic]
    );
    if (existing.rows[0]) {
      await query(
        `UPDATE ai_knowledge_gaps SET frequency_count = frequency_count + 1, updated_at = now() WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO ai_knowledge_gaps (topic, sample_question, collection_guess) VALUES ($1,$2,$3)`,
        [topic, message.slice(0, 2000), collectionGuess]
      );
    }
  } catch {
    // best-effort only — never let logging break the chat reply
  }
}
