// Jedida AI Assistant — the in-chat assistant layer for ChatV2.
//
// Runs on every non-admin, non-AI text message in a conversation that still
// has ai_enabled=true and escalated=false (see chatSocket.js / chatV2.js).
// Two jobs:
//   1. Decide whether the message needs a verified human rep (escalation).
//   2. Otherwise, answer using marketplace context via the deterministic
//      reply logic below — no external API, no LLM. See
//      backend/src/ai/orchestrator.js for the design rationale behind
//      running the whole AI ecosystem on local logic.
//
// This module never touches sockets/broadcast — callers (chatSocket.js,
// chatV2.js) own persistence + real-time delivery, so both the socket path
// and the plain-REST path can reuse the same logic.

import { query } from '../config/db.js';
import { memoryDigest } from '../services/shopAiMemory.js';

// Fixed id from schema_phase37_ai_assistant.sql — the sender_id used for
// every AI-generated chat message.
export const SYSTEM_AI_USER_ID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Escalation detection
// ---------------------------------------------------------------------------
// Deliberately simple, auditable keyword/regex rules rather than an LLM call
// for this step — escalation decisions gate access to human agents, so they
// should be cheap, fast, and easy to reason about/tune, per the spec's
// "AI identifies need for human help" flow.

const ESCALATION_RULES = [
  {
    area: 'security',
    reason: 'Possible fraud, account compromise, or policy violation',
    re: /\b(scam(med)?|fraud|hacked|hijacked|stolen (my )?account|unauthorized (login|access|charge)|phishing|fake (seller|buyer|product)|report (this|him|her|them) for fraud)\b/i,
  },
  {
    area: 'customer_support',
    reason: 'Payment or refund issue',
    re: /\b(refund|money back|charged twice|double charged|payment (failed|not going through|didn'?t go through)|didn'?t receive my (money|payment)|chargeback|dispute (this|the) (order|payment|charge))\b/i,
  },
  {
    area: 'customer_support',
    reason: 'Account verification issue',
    re: /\b(verify my account|verification (failed|stuck|pending)|kyc (issue|problem|rejected)|can'?t verify)\b/i,
  },
  {
    area: 'business',
    reason: 'Business partnership or complex negotiation',
    re: /\b(partnership|bulk (deal|order|contract)|wholesale (deal|agreement)|distributor(ship)?|become a (supplier|manufacturer|dropshipper)|business proposal|negotiate (a )?(price|contract|deal))\b/i,
  },
  {
    area: 'delivery',
    reason: 'Delivery problem',
    re: /\b(delivery (is )?(late|failed|never arrived)|rider (never showed|didn'?t show|is rude)|package (lost|missing|damaged)|wrong (item|address) delivered|failed delivery)\b/i,
  },
  {
    area: 'customer_support',
    reason: 'Customer appears frustrated and may need a human',
    // ALL-CAPS shouting (5+ letters) or repeated punctuation, combined with
    // an explicit request for a human — kept narrow to avoid over-triggering
    // on ordinary enthusiastic messages.
    re: /\b(speak to (a )?(human|person|agent|representative)|talk to (a )?(human|person|agent|representative)|this is (ridiculous|unacceptable)|worst (service|experience))\b/i,
  },
];

export function detectEscalation(text = '') {
  const trimmed = (text || '').trim();
  if (!trimmed) return { escalate: false };

  for (const rule of ESCALATION_RULES) {
    if (rule.re.test(trimmed)) {
      return { escalate: true, area: rule.area, reason: rule.reason };
    }
  }
  return { escalate: false };
}

const AREA_LABELS = {
  customer_support: 'Customer Support',
  business: 'Business Relations',
  delivery: 'Delivery Support',
  security: 'Security',
};

export function buildHandoverMessage(area) {
  const label = AREA_LABELS[area] || 'Support';
  return `I've connected you with our ${label} team — a verified Jedida representative will join this conversation shortly. Your message history is visible to them so you won't need to repeat yourself.`;
}

// ---------------------------------------------------------------------------
// Marketplace context (grounds the assistant's replies in real data)
// ---------------------------------------------------------------------------

export async function fetchConversationContext(conversation) {
  const context = { product: null, order: null, shopMemory: null };

  if (conversation.product_id) {
    const result = await query(
      `SELECT p.title, p.price, p.currency, p.minimum_order_quantity AS moq,
              p.quantity_available AS stock_quantity, p.category, s.name AS shop_name
       FROM products p LEFT JOIN shops s ON s.id = p.shop_id
       WHERE p.id = $1`,
      [conversation.product_id]
    );
    context.product = result.rows[0] || null;
  }

  if (conversation.order_id) {
    const result = await query(
      `SELECT o.status, o.total_amount, o.currency, o.created_at,
              d.status AS delivery_status, d.estimated_at
       FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id
       WHERE o.id = $1`,
      [conversation.order_id]
    );
    context.order = result.rows[0] || null;
  }

  if (conversation.seller_id) {
    const shopResult = await query(`SELECT id FROM shops WHERE owner_id = $1 LIMIT 1`, [conversation.seller_id]);
    const shop = shopResult.rows[0];
    if (shop) context.shopMemory = await memoryDigest(shop.id, 8);
  }

  return context;
}

// ---------------------------------------------------------------------------
// Reply generation
// ---------------------------------------------------------------------------

function heuristicReply(text, context) {
  const t = text.toLowerCase();

  if (context.order) {
    if (/\b(track|where|status|delivery)\b/.test(t)) {
      const o = context.order;
      return `Your order is currently "${o.status}"${o.delivery_status ? `, delivery status: "${o.delivery_status}"` : ''}. You can also check live tracking from your Orders page. Let me know if you'd like me to connect you with a human agent about this order.`;
    }
  }

  if (context.product) {
    const p = context.product;
    if (/\b(price|cost|how much)\b/.test(t)) {
      return `This listing is priced at ${p.price} ${p.currency || ''} per unit${p.moq ? `, with a minimum order quantity of ${p.moq}` : ''}. Would you like help placing an order?`;
    }
    if (/\b(moq|minimum order|bulk)\b/.test(t)) {
      return p.moq
        ? `The minimum order quantity for this product is ${p.moq} units.`
        : `This listing doesn't have a minimum order quantity set — you can order any amount in stock.`;
    }
    if (/\b(stock|available|in stock)\b/.test(t)) {
      return typeof p.stock_quantity === 'number'
        ? `There are currently ${p.stock_quantity} units in stock.`
        : `I don't have exact stock numbers handy — the seller can confirm availability.`;
    }
  }

  if (/\b(hi|hello|hey)\b/.test(t)) {
    return `Hi! I'm the Jedida AI Assistant. I can help with product questions, pricing, order status, and delivery updates — and I can bring in a human teammate any time you need one. What can I help with?`;
  }

  return `Thanks for your message — I'm the Jedida AI Assistant and I've noted it. If this needs a closer look from our team, just say "talk to a human" and I'll connect you with a verified representative.`;
}

export async function generateAssistantReply({ text, context }) {
  const reply = heuristicReply(text, context);
  if (context.shopMemory) {
    const firstFact = context.shopMemory.split('\n')[0]?.replace(/^- \(\w+\)\s*/, '');
    if (firstFact) return `${reply}\n\n(Also worth knowing: ${firstFact})`;
  }
  return reply;
}

// ---------------------------------------------------------------------------
// Escalation persistence
// ---------------------------------------------------------------------------

export async function recordEscalation({ conversationId, userId, area, reason, triggerExcerpt }) {
  const convResult = await query(
    `UPDATE chat_conversations SET escalated = TRUE, escalation_area = $2, escalated_at = now() WHERE id = $1 RETURNING *`,
    [conversationId, area]
  );
  const conversation = convResult.rows[0];

  const result = await query(
    `INSERT INTO chat_ai_escalations (conversation_id, user_id, area, reason, trigger_excerpt)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [conversationId, userId, area, reason, (triggerExcerpt || '').slice(0, 300)]
  );

  // Business-relations escalations (negotiation, wholesale, partnership)
  // go to the shop owner directly — they're the one who can actually
  // confirm terms — in addition to being visible to Jedida admins via the
  // usual escalations queue. Other areas (security, payments, delivery)
  // stay admin-only, since those need a verified Jedida rep, not the seller.
  if (area === 'business' && conversation?.seller_id) {
    try {
      const buyerResult = await query('SELECT full_name FROM users WHERE id = $1', [userId]);
      const buyerName = buyerResult.rows[0]?.full_name || 'A buyer';
      const context = await fetchConversationContext(conversation);
      const parts = [`💼 ${buyerName} needs your input on a business conversation: "${reason}".`];
      if (context.product) parts.push(`Product: ${context.product.title} (${context.product.currency} ${context.product.price}).`);
      if (context.order) parts.push(`Order status: ${context.order.status}.`);
      parts.push('Reply in this chat when you can.');
      const handoverBody = parts.join(' ');

      await query(
        'INSERT INTO chat_messages (user_id, sender_id, body) VALUES ($1,$2,$3)',
        [conversation.seller_id, SYSTEM_AI_USER_ID, handoverBody]
      );
      await query(
        `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'system_announcement', 'A buyer needs your input', $2)`,
        [conversation.seller_id, handoverBody]
      );
    } catch (err) {
      console.error('recordEscalation: seller handover notice failed (non-fatal).', err.message);
    }
  }

  return result.rows[0];
}

export async function resolveEscalation({ escalationId, resolvedBy }) {
  const result = await query(
    `UPDATE chat_ai_escalations SET status = 'resolved', resolved_by = $2, resolved_at = now()
     WHERE id = $1 RETURNING *`,
    [escalationId, resolvedBy]
  );
  const escalation = result.rows[0];
  if (escalation) {
    await query(
      `UPDATE chat_conversations SET escalated = FALSE, assigned_admin_id = $2 WHERE id = $1`,
      [escalation.conversation_id, resolvedBy]
    );
  }
  return escalation || null;
}

export async function listOpenEscalations() {
  const result = await query(
    `SELECT e.*, u.full_name, u.primary_role, c.product_id, c.order_id
     FROM chat_ai_escalations e
     JOIN users u ON u.id = e.user_id
     JOIN chat_conversations c ON c.id = e.conversation_id
     WHERE e.status = 'open'
     ORDER BY e.created_at DESC`
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Orchestration entry point
// ---------------------------------------------------------------------------

// Called once per incoming text message. Returns:
//   { escalation: null | { area, reason }, replyText: string | null }
// Never throws — a failure here should never block message delivery, so
// callers should still wrap this in try/catch and treat any error as a
// no-op (see chatSocket.js).
export async function processIncomingMessage({ conversation, user, text }) {
  if (!conversation) return { escalation: null, replyText: null };
  if (user?.isAdmin) return { escalation: null, replyText: null };
  if (String(user?.id) === SYSTEM_AI_USER_ID) return { escalation: null, replyText: null };
  if (conversation.ai_enabled === false) return { escalation: null, replyText: null };
  if (conversation.escalated) return { escalation: null, replyText: null };
  if (!text || !text.trim()) return { escalation: null, replyText: null };

  const escalation = detectEscalation(text);
  if (escalation.escalate) {
    await recordEscalation({
      conversationId: conversation.id,
      userId: user.id,
      area: escalation.area,
      reason: escalation.reason,
      triggerExcerpt: text,
    });
    return { escalation, replyText: buildHandoverMessage(escalation.area) };
  }

  const context = await fetchConversationContext(conversation);
  const replyText = await generateAssistantReply({ text, context });
  return { escalation: null, replyText };
}
