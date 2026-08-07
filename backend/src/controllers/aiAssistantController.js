import { query } from '../config/db.js';
import { getOrchestratedReply } from '../ai/orchestrator.js';
import { logKnowledgeGap } from '../services/aiKnowledgeLookup.js';

// Short, cheap context lines so replies can be grounded without the
// person having to repeat themselves every message. Best-effort — an
// empty shop/order history still gets a reply, just without the aside.
// Returns the shop id too now (not just the summary line) so the
// orchestrator can pull that shop's shopAiMemory digest.
async function shopContextFor(userId) {
  try {
    const result = await query(
      `SELECT s.id, s.name, s.primary_category, s.theme,
              (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) AS product_count
       FROM shops s WHERE s.owner_id = $1`,
      [userId]
    );
    const shop = result.rows[0];
    if (!shop) return { text: null, shopId: null };
    const text = `Shop "${shop.name}", category ${shop.primary_category || 'unset'}, ${shop.product_count} product(s) listed, theme ${shop.theme || 'default'}.`;
    return { text, shopId: shop.id };
  } catch {
    return { text: null, shopId: null };
  }
}

async function buyerContextFor(userId) {
  try {
    const result = await query(
      `SELECT status, created_at FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const order = result.rows[0];
    if (!order) return null;
    return `Most recent order status: ${order.status.replace(/_/g, ' ')}.`;
  } catch {
    return null;
  }
}

// Fetches (and validates ownership of) an existing widget conversation, or
// starts a new one. Never trusts a conversationId belonging to someone else.
async function resolveConversation(userId, audience, conversationId) {
  if (conversationId) {
    const existing = await query(
      `SELECT id FROM ai_assistant_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }
  const created = await query(
    `INSERT INTO ai_assistant_conversations (user_id, audience) VALUES ($1,$2) RETURNING id`,
    [userId, audience]
  );
  return created.rows[0].id;
}

// Recent turns for this conversation, oldest first — this is the
// orchestrator's "conversation memory" (see jedida_ai_architecture.md §3).
// Reuses the existing append-only log rather than a new table.
async function recentHistory(conversationId, limit = 6) {
  if (!conversationId) return [];
  try {
    const result = await query(
      `SELECT role, content FROM ai_assistant_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [conversationId, limit]
    );
    return result.rows.reverse();
  } catch {
    return [];
  }
}

export async function postAssistantChat(req, res) {
  const { message, deepMode, audience, conversationId } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Say something to Jedida AI first.' });
  if (message.length > 4000) return res.status(400).json({ error: 'That message is too long — try breaking it up.' });

  const resolvedAudience = audience === 'buyer' ? 'buyer' : 'seller';

  try {
    let context = null;
    let shopId = null;
    if (resolvedAudience === 'buyer') {
      context = await buyerContextFor(req.user.id);
    } else {
      const shopInfo = await shopContextFor(req.user.id);
      context = shopInfo.text;
      shopId = shopInfo.shopId;
    }

    // Resolve/validate the conversation *before* generating the reply now,
    // so the orchestrator can be handed real prior turns instead of
    // starting cold every message.
    const convId = await resolveConversation(req.user.id, resolvedAudience, conversationId);
    const history = await recentHistory(convId);

    const { reply, source, answeredFromKnowledge } = await getOrchestratedReply({
      message: message.trim(),
      deepMode: !!deepMode,
      shopContext: context,
      shopId,
      audience: resolvedAudience,
      history,
    });

    // A knowledge gap is worth logging whenever Jedida's own knowledge
    // base had nothing — whether the local classifier fell through to the
    // generic default, or a Google research lookup had to fill in. Either
    // way it's a real signal that Jedida's own content doesn't cover this
    // topic yet, worth an admin's attention in the Training Center queue
    // even when the person still got a useful answer.
    if (source === 'nlu_fallback' || source === 'google_research') {
      logKnowledgeGap(message.trim()); // best-effort, not awaited-critical
    }

    // Log the exchange so a rating or a support correction can reference
    // this exact question/answer later. Best-effort: a logging failure
    // should never block the reply the person is waiting on.
    let assistantMessageId = null;
    try {
      await query(
        `INSERT INTO ai_assistant_messages (conversation_id, role, content) VALUES ($1,'user',$2)`,
        [convId, message.trim()]
      );
      const assistantRow = await query(
        `INSERT INTO ai_assistant_messages (conversation_id, role, content, answered_from_knowledge)
         VALUES ($1,'assistant',$2,$3) RETURNING id`,
        [convId, reply, answeredFromKnowledge]
      );
      assistantMessageId = assistantRow.rows[0].id;
      await query(`UPDATE ai_assistant_conversations SET last_message_at = now() WHERE id = $1`, [convId]);
    } catch (logErr) {
      console.error('Jedida AI Assistant conversation log error:', logErr);
    }

    return res.json({ reply, conversationId: convId, messageId: assistantMessageId, answeredFromKnowledge });
  } catch (err) {
    console.error('Jedida AI Assistant chat error:', err);
    return res.status(500).json({ error: 'Jedida AI is unavailable right now — try again in a moment.' });
  }
}
