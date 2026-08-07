import express from 'express';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';
import {
  getOrCreateConversation,
  saveMessage,
  getMessages,
  createBridge,
  getUserLanguage,
  searchMessages,
  closeConversation,
  getPinnedMessages,
  isBlockedEitherWay,
  blockUser,
  unblockUser,
  listBlockedUsers,
  reportMessage,
  listReports,
  updateReportStatus,
  setConversationState,
  listConversationsForUser,
  getConversationById,
  listBlockedMessages,
  listSuspiciousConversations,
  getUserModerationHistory,
  getModerationSummary
} from '../chat/chatService.js';
import { scanMessageText, isExemptSender, recordModerationEvent, buildReminderMessage, ORDER_PROTECTION_REMINDER } from '../chat/contactModerationEngine.js';
import { processIncomingMessage, recordEscalation, resolveEscalation, listOpenEscalations, SYSTEM_AI_USER_ID } from '../chat/aiAssistant.js';
import { isUserOnline } from '../chat/chatSocket.js';
import { sendPushToUser } from '../services/pushService.js';
import { query } from '../config/db.js';

const router = express.Router();


// Buyer opens marketplace contact
router.post('/contact-product', requireAuth, async (req,res)=>{
try {

  const {
    productId,
    message
  } = req.body;


  const conversation = await getOrCreateConversation({
    userId:req.user.id,
    productId
  });


  if(message){
    await saveMessage({
      conversationId:conversation.id,
      userId:req.user.id,
      senderId:req.user.id,
      body:message
    });
  }


  res.json({
    conversation,
    reminder: ORDER_PROTECTION_REMINDER
  });


} catch(err){

 console.error('CHAT CONTACT ERROR:',err);

 res.status(500).json({
   error:'Unable to create chat'
 });

}

});


// Current buyer conversation
router.get('/mine', requireAuth, async(req,res)=>{

  const conversation = await getOrCreateConversation({
    userId:req.user.id
  });


  res.json({
    conversation,
    reminder: ORDER_PROTECTION_REMINDER
  });

});



// Messages
router.get('/:conversationId/messages',
requireAuth,
async(req,res)=>{

  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.user.isAdmin && conversation.user_id !== req.user.id && conversation.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Not a participant in this conversation' });
  }

  const messages = await getMessages(
    req.params.conversationId
  );

  const myLanguage = await getUserLanguage(req.user.id);
  const withTranslations = messages.map((m) => ({
    ...m,
    display_body: m.translations?.[myLanguage] || m.body,
  }));


  res.json({
    messages: withTranslations,
    reminder: ORDER_PROTECTION_REMINDER
  });

});



// Send message
router.post('/:conversationId/messages',
requireAuth,
async(req,res)=>{
try {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });

  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.user.isAdmin && conversation.user_id !== req.user.id && conversation.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Not a participant in this conversation' });
  }

  const otherUserId = conversation.user_id === req.user.id ? conversation.seller_id : conversation.user_id;
  if (await isBlockedEitherWay(req.user.id, otherUserId)) {
    return res.status(403).json({ error: 'You can no longer message this user.' });
  }

  let finalBody = body;
  let moderationStatus = 'clean';
  let originalBody = null;
  let scanResult = null;

  if (!isExemptSender(req.user)) {
    scanResult = scanMessageText(body);
    if (scanResult.action === 'block') {
      const blockedMsg = await saveMessage({
        conversationId: req.params.conversationId, userId: req.user.id, senderId: req.user.id,
        body: '[message blocked by Petiti AI — contact-sharing attempt]',
        moderationStatus: 'blocked', originalBody: body
      });
      await recordModerationEvent({ conversationId: req.params.conversationId, messageId: blockedMsg.id, userId: req.user.id, result: scanResult });
      return res.status(422).json({ error: buildReminderMessage(scanResult), moderation: { status: 'blocked' } });
    }
    if (scanResult.action === 'mask') {
      finalBody = scanResult.maskedText;
      moderationStatus = 'masked';
      originalBody = body;
    }
  }

  const message = await saveMessage({
    conversationId: req.params.conversationId,
    userId: req.user.id,
    senderId: req.user.id,
    body: finalBody,
    moderationStatus,
    originalBody,
    isOfficial: Boolean(req.user.isAdmin)
  });

  if (moderationStatus === 'masked') {
    await recordModerationEvent({ conversationId: req.params.conversationId, messageId: message.id, userId: req.user.id, result: scanResult });
  }

  if (!isUserOnline(otherUserId)) {
    (async () => {
      let senderName = 'JEDIDA Support';
      if (!req.user.isAdmin) {
        const senderResult = await query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
        senderName = senderResult.rows[0]?.full_name || 'New message';
      }
      await sendPushToUser(otherUserId, {
        title: senderName,
        body: (finalBody || '').slice(0, 120) || 'New message',
        data: { type: 'chat', conversationId: req.params.conversationId }
      });
    })().catch((err) => console.error('chatV2 push notify error (non-fatal):', err.message));
  }

  let aiMessage = null;
  if (!req.user.isAdmin) {
    try {
      const { replyText } = await processIncomingMessage({ conversation, user: req.user, text: body });
      if (replyText) {
        aiMessage = await saveMessage({
          conversationId: req.params.conversationId,
          userId: conversation.user_id,
          senderId: SYSTEM_AI_USER_ID,
          body: replyText,
          messageType: 'text',
          isAi: true
        });
      }
    } catch (err) {
      console.error('AI assistant turn failed (non-fatal):', err.message);
    }
  }

  res.json({
    message,
    aiMessage,
    moderation: moderationStatus === 'masked' ? { status: 'masked', reminder: buildReminderMessage(scanResult) } : { status: 'clean' }
  });
} catch (err) {
  console.error('CHAT SEND ERROR:', err);
  res.status(500).json({ error: 'Unable to send message' });
}
});

// ---------------------------------------------------------------------------
// Counterpart profile — powers the new chat header (verification badge,
// business type, trust score, online status). Every signal shown here is
// computed from real data (kyc_status, shop verification/subscription,
// product review ratings, completed order history, live socket presence) —
// nothing here is a placeholder number.
// ---------------------------------------------------------------------------
// Fetches a single conversation by id, for deep-linking (e.g. a push
// notification tap) into a conversation that isn't necessarily the user's
// default one from /mine. Participant-only.
router.get('/:conversationId', requireAuth, async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!req.user.isAdmin && conversation.user_id !== req.user.id && conversation.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }
    res.json({ conversation });
  } catch (err) {
    console.error('get conversation error:', err.message);
    res.status(500).json({ error: 'Unable to load conversation' });
  }
});

router.get('/:conversationId/participant', requireAuth, async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const otherUserId = conversation.user_id === req.user.id ? conversation.seller_id : conversation.user_id;
    if (!otherUserId) return res.json({ participant: null });

    const userResult = await query(
      `SELECT id, full_name, avatar_url, primary_role, kyc_status, created_at
       FROM users WHERE id = $1`,
      [otherUserId]
    );
    const user = userResult.rows[0];
    if (!user) return res.json({ participant: null });

    const isBusiness = ['seller', 'manufacturer', 'supplier', 'dropshipper', 'farmer'].includes(user.primary_role);

    let shop = null;
    let rating = { average: null, count: 0 };
    let completedOrders = 0;

    if (isBusiness) {
      const shopResult = await query(
        `SELECT id, name, slug, logo_url, subscription_active, status FROM shops WHERE owner_id = $1 LIMIT 1`,
        [otherUserId]
      );
      shop = shopResult.rows[0] || null;

      if (shop) {
        const ratingResult = await query(
          `SELECT AVG(r.rating)::numeric(3,2) AS average, COUNT(*)::int AS count
           FROM product_reviews r JOIN products p ON p.id = r.product_id
           WHERE p.shop_id = $1`,
          [shop.id]
        );
        rating = { average: ratingResult.rows[0]?.average ? Number(ratingResult.rows[0].average) : null, count: ratingResult.rows[0]?.count || 0 };

        const ordersResult = await query(
          `SELECT COUNT(*)::int AS count FROM orders WHERE shop_id = $1 AND status IN ('delivered_confirmed','completed')`,
          [shop.id]
        );
        completedOrders = ordersResult.rows[0]?.count || 0;
      }
    }

    // Trust score — transparent, additive formula out of 100, not a random
    // or invented figure: identity verification, business standing, real
    // review rating, and delivery track record.
    let trustScore = 50;
    if (user.kyc_status === 'verified') trustScore += 20;
    if (shop?.subscription_active) trustScore += 8;
    if (shop?.status === 'active') trustScore += 4;
    if (rating.average) trustScore += Math.round((rating.average / 5) * 13);
    trustScore += Math.min(completedOrders, 20) * 0.25;
    trustScore = Math.max(35, Math.min(99, Math.round(trustScore)));

    return res.json({
      participant: {
        id: user.id,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        role: user.primary_role,
        isBusiness,
        isVerified: user.kyc_status === 'verified',
        memberSince: user.created_at,
        shop: shop ? { id: shop.id, name: shop.name, slug: shop.slug, logoUrl: shop.logo_url, subscriptionActive: shop.subscription_active } : null,
        rating,
        completedOrders,
        trustScore,
        isOnline: isUserOnline(user.id)
      }
    });
  } catch (err) {
    console.error('CHAT PARTICIPANT ERROR:', err);
    res.status(500).json({ error: 'Could not load participant profile' });
  }
});

// ---------------------------------------------------------------------------
// Business control panel data — orders/payments/delivery between these two
// participants (buyer side), plus lightweight sales analytics + inquiry
// count for the business side. All real queries against orders/payments/
// deliveries — nothing fabricated; sections with no data return empty
// arrays/zeros so the panel can show a proper empty state.
// ---------------------------------------------------------------------------
router.get('/:conversationId/business-summary', requireAuth, async (req, res) => {
  try {
    const conversation = await getConversationById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.user_id !== req.user.id && conversation.seller_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const buyerId = conversation.user_id;
    const sellerId = conversation.seller_id;

    const shopResult = sellerId
      ? await query('SELECT id, name FROM shops WHERE owner_id = $1 LIMIT 1', [sellerId])
      : { rows: [] };
    const shop = shopResult.rows[0] || null;

    let orders = [];
    let payments = [];
    let deliveries = [];
    if (shop) {
      const ordersResult = await query(
        `SELECT o.id, o.status, o.total_amount, o.currency, o.quantity, o.created_at,
                o.product_id, p.title AS product_title
         FROM orders o LEFT JOIN products p ON p.id = o.product_id
         WHERE o.buyer_id = $1 AND o.shop_id = $2
         ORDER BY o.created_at DESC LIMIT 25`,
        [buyerId, shop.id]
      );
      orders = ordersResult.rows;

      if (orders.length) {
        const orderIds = orders.map((o) => o.id);
        const paymentsResult = await query(
          `SELECT id, order_id, method, amount, currency, status, created_at
           FROM payments WHERE order_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
          [orderIds]
        );
        payments = paymentsResult.rows;

        const deliveriesResult = await query(
          `SELECT id, order_id, status, estimated_at, delivered_at
           FROM deliveries WHERE order_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
          [orderIds]
        );
        deliveries = deliveriesResult.rows;
      }
    }

    let salesAnalytics = null;
    let inquiriesCount = null;
    const iAmSeller = req.user.id === sellerId;
    if (iAmSeller && shop) {
      const analyticsResult = await query(
        `SELECT COUNT(*)::int AS total_orders,
                COALESCE(SUM(total_amount) FILTER (WHERE status IN ('delivered_confirmed','completed')), 0) AS revenue,
                COUNT(*) FILTER (WHERE status IN ('delivered_confirmed','completed'))::int AS completed_orders
         FROM orders WHERE shop_id = $1`,
        [shop.id]
      );
      salesAnalytics = analyticsResult.rows[0];

      const inquiriesResult = await query(
        `SELECT COUNT(DISTINCT user_id)::int AS count FROM chat_conversations WHERE seller_id = $1`,
        [sellerId]
      );
      inquiriesCount = inquiriesResult.rows[0]?.count || 0;
    }

    let product = null;
    if (conversation.product_id) {
      const productResult = await query(
        `SELECT id, title, price, currency, minimum_order_quantity AS moq, quantity_available AS stock, category
         FROM products WHERE id = $1`,
        [conversation.product_id]
      );
      product = productResult.rows[0] || null;
    }

    res.json({
      product, orders, payments, deliveries,
      aiEnabled: conversation.ai_enabled, escalated: conversation.escalated,
      salesAnalytics, inquiriesCount
    });
  } catch (err) {
    console.error('CHAT BUSINESS SUMMARY ERROR:', err);
    res.status(500).json({ error: 'Could not load business summary' });
  }
});

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

router.post('/block', requireAuth, async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const block = await blockUser({ blockerId: req.user.id, blockedId: userId, reason });
  res.json({ block });
});

router.post('/unblock', requireAuth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  await unblockUser({ blockerId: req.user.id, blockedId: userId });
  res.json({ success: true });
});

router.get('/blocked', requireAuth, async (req, res) => {
  const blocked = await listBlockedUsers(req.user.id);
  res.json({ blocked });
});

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

router.post('/:conversationId/messages/:messageId/report', requireAuth, async (req, res) => {
  const { reason, details, reportedUserId } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason is required' });
  const report = await reportMessage({
    messageId: req.params.messageId,
    conversationId: req.params.conversationId,
    reporterId: req.user.id,
    reportedUserId,
    reason,
    details
  });
  res.status(201).json({ report });
});

router.get('/admin/reports', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const reports = await listReports({ status: req.query.status });
  res.json({ reports });
});

router.post('/admin/reports/:reportId/status', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const { status } = req.body;
  const report = await updateReportStatus({ reportId: req.params.reportId, status, reviewedBy: req.user.id });
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json({ report });
});

// Admin: users with elevated chat risk scores, for the Security Center.
router.get('/admin/risk-users', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const result = await query(
    `SELECT id, full_name, email, primary_role, chat_risk_score
     FROM users WHERE chat_risk_score > 0
     ORDER BY chat_risk_score DESC LIMIT 100`
  );
  res.json({ users: result.rows });
});

// ---------------------------------------------------------------------------
// Pin / archive
// ---------------------------------------------------------------------------

router.post('/:conversationId/pin', requireAuth, async (req, res) => {
  const { pinned } = req.body;
  const state = await setConversationState({ conversationId: req.params.conversationId, userId: req.user.id, pinned: Boolean(pinned) });
  res.json({ state });
});

router.post('/:conversationId/archive', requireAuth, async (req, res) => {
  const { archived } = req.body;
  const state = await setConversationState({ conversationId: req.params.conversationId, userId: req.user.id, archived: Boolean(archived) });
  res.json({ state });
});

router.get('/conversations', requireAuth, async (req, res) => {
  const conversations = await listConversationsForUser(req.user.id);
  res.json({ conversations });
});



// Search within a conversation's message history
router.get('/:conversationId/messages/search',
requireAuth,
async(req,res)=>{
  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.user.isAdmin && conversation.user_id !== req.user.id && conversation.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Not a participant in this conversation' });
  }
  const term = (req.query.q || '').trim();
  if (!term) return res.json({ messages: [] });
  const messages = await searchMessages(req.params.conversationId, term);
  res.json({ messages });
});

// Pinned messages for a conversation
router.get('/:conversationId/messages/pinned',
requireAuth,
async(req,res)=>{
  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.user.isAdmin && conversation.user_id !== req.user.id && conversation.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Not a participant in this conversation' });
  }
  const messages = await getPinnedMessages(req.params.conversationId);
  res.json({ messages });
});

// "Delete chat" — closes this conversation; the next /mine call opens a
// fresh one. Message history for a closed conversation is kept (for the
// admin's record and any bridged partner) rather than hard-deleted.
router.post('/:conversationId/close',
requireAuth,
async(req,res)=>{
  const existing = await getConversationById(req.params.conversationId);
  if (!existing) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.user.isAdmin && existing.user_id !== req.user.id && existing.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'Not a participant in this conversation' });
  }
  const conversation = await closeConversation(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ conversation });
});


// Admin conversations — with who each one belongs to, since the
// admin UI displays the participant's name and role, not raw conversation rows.
router.get('/admin/conversations',
requireAuth,
requireAdmin,
requirePermission('chat'),
async(req,res)=>{

  const result = await query(
    `
    SELECT c.*, u.full_name, u.primary_role
    FROM chat_conversations c
    JOIN users u ON u.id = c.user_id
    WHERE c.status = 'open'
    ORDER BY c.created_at DESC
    `
  );


  res.json({
    conversations:result.rows
  });

});


// Admin bridges two conversations so their participants can relay messages
// through the admin without exchanging direct contact details.
router.post('/admin/bridge',
requireAuth,
requireAdmin,
requirePermission('chat'),
async(req,res)=>{

  try {
    const { conversationAId, conversationBId, reason } = req.body;

    if (!conversationAId || !conversationBId || conversationAId === conversationBId) {
      return res.status(400).json({ error: 'Select two different conversations to bridge.' });
    }

    const bridge = await createBridge({
      buyerConversationId: conversationAId,
      sellerConversationId: conversationBId,
      adminId: req.user.id,
      reason
    });

    res.json({ bridge });
  } catch (err) {
    console.error('CHAT BRIDGE ERROR:', err);
    res.status(500).json({ error: 'Unable to bridge conversations' });
  }

});


// ---------------------------------------------------------------------------
// AI assistant escalation
// ---------------------------------------------------------------------------

// Buyer/seller taps "Talk to a human" — bypasses keyword detection and
// escalates immediately to the area they choose.
router.post('/:conversationId/escalate', requireAuth, async (req, res) => {
  const { area, reason } = req.body;
  const validAreas = ['customer_support', 'business', 'delivery', 'security'];
  if (!validAreas.includes(area)) {
    return res.status(400).json({ error: `area must be one of: ${validAreas.join(', ')}` });
  }
  const conversation = await getConversationById(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const escalation = await recordEscalation({
    conversationId: conversation.id,
    userId: req.user.id,
    area,
    reason: reason || 'Buyer requested a human representative',
    triggerExcerpt: reason || null
  });

  res.json({ escalation });
});

// Admin: the live escalation queue, across all areas — client-side filters
// by the admin's own area of responsibility.
router.get('/admin/escalations', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const escalations = await listOpenEscalations();
  res.json({ escalations });
});

// Admin: pick up an escalation — resolves it and hands the conversation
// back to a human (ai_enabled stays as-is; escalated flips back to false).
router.post('/admin/escalations/:escalationId/resolve', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const escalation = await resolveEscalation({ escalationId: req.params.escalationId, resolvedBy: req.user.id });
  if (!escalation) return res.status(404).json({ error: 'Escalation not found' });
  res.json({ escalation });
});

// Admin/support: toggle the AI assistant on or off for a specific
// conversation (e.g. once a human has taken over for good).
router.post('/:conversationId/ai-toggle', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const { enabled } = req.body;
  const result = await query(
    `UPDATE chat_conversations SET ai_enabled = $2 WHERE id = $1 RETURNING *`,
    [req.params.conversationId, Boolean(enabled)]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ conversation: result.rows[0] });
});

// ---------------------------------------------------------------------------
// Stage 5 — Admin Security Center: chat protection views.
// ---------------------------------------------------------------------------

router.get('/admin/blocked-messages', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const messages = await listBlockedMessages({ limit: req.query.limit ? Number(req.query.limit) : undefined });
  res.json({ messages });
});

router.get('/admin/suspicious-conversations', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const conversations = await listSuspiciousConversations({
    minEvents: req.query.minEvents ? Number(req.query.minEvents) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({ conversations });
});

router.get('/admin/users/:userId/moderation-history', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const history = await getUserModerationHistory(req.params.userId);
  if (!history) return res.status(404).json({ error: 'User not found.' });
  res.json(history);
});

router.get('/admin/moderation-summary', requireAuth, requireAdmin, requirePermission('chat'), async (req, res) => {
  const summary = await getModerationSummary();
  res.json({ summary });
});

export default router;
