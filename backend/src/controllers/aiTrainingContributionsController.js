import { query } from '../config/db.js';
import { scanKnowledgeContent, ALLOWED_COLLECTIONS } from '../services/aiKnowledgeGuard.js';

// Verifies a given assistant message id actually belongs to this user
// before letting them rate or correct it — the message_id here isn't a
// foreign key (see schema_phase50), so this is where ownership is enforced.
async function ownsAssistantMessage(userId, messageId) {
  if (!messageId) return true; // feedback/correction without a specific message is still allowed
  const result = await query(
    `SELECT 1 FROM ai_assistant_messages m
     JOIN ai_assistant_conversations c ON c.id = m.conversation_id
     WHERE m.id = $1 AND c.user_id = $2`,
    [messageId, userId]
  );
  return result.rows.length > 0;
}

// Business owners (sellers/manufacturers/suppliers) suggesting a product or
// business FAQ. Lands as 'pending' — never touches the AI until an admin
// approves it (see aiTrainingController.reviewSuggestion).
export async function submitSuggestion(req, res) {
  try {
    const { collection, question, suggestedAnswer } = req.body;
    if (!question?.trim() || !suggestedAnswer?.trim()) {
      return res.status(400).json({ error: 'Question and suggested answer are required.' });
    }
    if (!ALLOWED_COLLECTIONS.includes(collection)) return res.status(400).json({ error: 'Invalid collection.' });

    const scan = scanKnowledgeContent(`${question}\n${suggestedAnswer}`);
    const role = req.user.isAdmin ? 'admin' : (req.user.role === 'seller' ? 'business_owner' : 'business_owner');

    const result = await query(
      `INSERT INTO ai_knowledge_suggestions (suggested_by, suggested_by_role, collection, question, suggested_answer)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, role, collection, question.trim(), suggestedAnswer.trim()]
    );
    return res.status(201).json({
      suggestion: result.rows[0],
      note: scan.clean ? undefined : 'Heads up: this may need edits before an admin can approve it (flagged content).',
    });
  } catch (err) {
    console.error('AI training submitSuggestion error:', err);
    return res.status(500).json({ error: 'Could not submit your suggestion.' });
  }
}

export async function mySuggestions(req, res) {
  try {
    const result = await query(
      `SELECT * FROM ai_knowledge_suggestions WHERE suggested_by = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    return res.json({ suggestions: result.rows });
  } catch (err) {
    console.error('AI training mySuggestions error:', err);
    return res.status(500).json({ error: 'Could not load your suggestions.' });
  }
}

// Support staff correcting a specific AI reply. original_answer is a short
// excerpt of what the AI said, kept only for reviewer context — the other
// party's private message is never stored here.
export async function submitCorrection(req, res) {
  try {
    const { conversationId, messageId, originalAnswer, correctedAnswer, collection, source } = req.body;
    if (!correctedAnswer?.trim()) return res.status(400).json({ error: 'Provide the corrected answer.' });
    if (collection && !ALLOWED_COLLECTIONS.includes(collection)) return res.status(400).json({ error: 'Invalid collection.' });
    const resolvedSource = source === 'assistant_widget' ? 'assistant_widget' : 'chat_v2';

    // Support staff can correct any buyer/seller's widget reply (that's the
    // point), so ownership isn't checked against req.user here — only that
    // the referenced message genuinely exists when a specific one is given.
    if (resolvedSource === 'assistant_widget' && messageId) {
      const exists = await query(`SELECT 1 FROM ai_assistant_messages WHERE id = $1 AND role = 'assistant'`, [messageId]);
      if (!exists.rows[0]) return res.status(404).json({ error: 'That AI reply could not be found.' });
    }

    const result = await query(
      `INSERT INTO ai_answer_corrections (conversation_id, message_id, original_answer, corrected_answer, collection, submitted_by, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [conversationId || null, messageId || null, (originalAnswer || '').slice(0, 2000), correctedAnswer.trim(), collection || null, req.user.id, resolvedSource]
    );
    return res.status(201).json({ correction: result.rows[0] });
  } catch (err) {
    console.error('AI training submitCorrection error:', err);
    return res.status(500).json({ error: 'Could not submit this correction.' });
  }
}

// Thumbs-up / thumbs-down after an AI reply. One rating per message per
// user — repeat calls update the existing rating rather than duplicating.
export async function submitFeedback(req, res) {
  try {
    const { conversationId, messageId, rating, comment, source } = req.body;
    if (!['helpful', 'not_helpful'].includes(rating)) return res.status(400).json({ error: 'Invalid rating.' });
    const resolvedSource = source === 'assistant_widget' ? 'assistant_widget' : 'chat_v2';

    if (resolvedSource === 'assistant_widget' && messageId) {
      const owns = await ownsAssistantMessage(req.user.id, messageId);
      if (!owns) return res.status(403).json({ error: 'You can only rate replies from your own conversation.' });
    }

    if (messageId) {
      const existing = await query(
        `SELECT id FROM ai_conversation_feedback WHERE message_id = $1 AND user_id = $2`,
        [messageId, req.user.id]
      );
      if (existing.rows[0]) {
        const updated = await query(
          `UPDATE ai_conversation_feedback SET rating=$1, comment=$2 WHERE id=$3 RETURNING *`,
          [rating, comment || null, existing.rows[0].id]
        );
        return res.json({ feedback: updated.rows[0] });
      }
    }

    const result = await query(
      `INSERT INTO ai_conversation_feedback (conversation_id, message_id, user_id, rating, comment, source)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [conversationId || null, messageId || null, req.user.id, rating, comment || null, resolvedSource]
    );
    return res.status(201).json({ feedback: result.rows[0] });
  } catch (err) {
    console.error('AI training submitFeedback error:', err);
    return res.status(500).json({ error: 'Could not record your feedback.' });
  }
}
