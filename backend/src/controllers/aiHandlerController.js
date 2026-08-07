// Jedida AI Handler — subscription management + the actual AI actions it's
// allowed to perform, for Manufacturers, Suppliers, Sellers and
// Dropshippers. Wraps the AI engines that already exist elsewhere on the
// platform (Amina/storeDesignerBot, Nsubuga Joseph/product review, TAUSI
// analytics+marketing, the buyer-chat assistant in chat/aiAssistant.js)
// behind subscription gating + the AI SECURITY RULES from the spec —
// every action here either can never touch money/orders/prices, or is
// explicitly rejected by aiHandlerGuard.assertAiActionAllowed.

import { query } from '../config/db.js';
import {
  getActiveSubscription, requireFeature, assertAiActionAllowed, logAiHandlerAction,
} from '../services/aiHandlerGuard.js';
import { designStore } from '../services/storeDesignerBot.js';
import { analyzeProduct } from '../services/nsubugaJosephBot.js';
import * as tausi from '../../ai/tausi/tausiService.js';
import * as marketing from '../../ai/tausi/tausiMarketingEngine.js';
import { fetchConversationContext, generateAssistantReply } from '../chat/aiAssistant.js';
import { scanMessageText } from '../chat/contactModerationEngine.js';

const ELIGIBLE_ROLES = ['manufacturer', 'supplier', 'dropshipper', 'seller', 'farmer'];

async function requireBusinessAccount(req, res) {
  if (!ELIGIBLE_ROLES.includes(req.user.role)) {
    res.status(403).json({ error: 'The Jedida AI Handler is available to manufacturers, suppliers, sellers, and dropshippers.' });
    return false;
  }
  return true;
}

function handleGuardError(res, err) {
  if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, code: err.code });
  console.error('AI Handler error:', err);
  return res.status(500).json({ error: 'The AI Handler could not complete that action right now.' });
}

// ===========================================================================
// PLANS + SUBSCRIPTION (business self-service)
// ===========================================================================

export async function listPlans(req, res) {
  const result = await query('SELECT * FROM ai_handler_plans WHERE active = TRUE ORDER BY sort_order');
  res.json({ plans: result.rows });
}

export async function mySubscription(req, res) {
  const sub = await getActiveSubscription(req.user.id);
  res.json({ subscription: sub });
}

// Activates or switches a plan. This does not itself move money — like the
// rest of the platform's role-upgrade flow, actual payment capture happens
// through Jedida's existing payment/wallet path (paymentProviders.js)
// before this is called; this endpoint just records the resulting plan
// state, matching how other subscription-ish flags on the platform
// (shops.subscription_active) are already set post-payment.
export async function subscribe(req, res) {
  if (!(await requireBusinessAccount(req, res))) return;
  const { planCode } = req.body;
  const plan = (await query('SELECT * FROM ai_handler_plans WHERE code = $1 AND active = TRUE', [planCode])).rows[0];
  if (!plan) return res.status(404).json({ error: 'Unknown plan.' });

  // Replace any existing active subscription rather than stacking.
  await query(`UPDATE ai_handler_subscriptions SET status = 'cancelled', cancelled_at = now() WHERE business_user_id = $1 AND status = 'active'`, [req.user.id]);

  const result = await query(
    `INSERT INTO ai_handler_subscriptions (business_user_id, plan_id) VALUES ($1,$2) RETURNING *`,
    [req.user.id, plan.id]
  );

  await query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'ai_handler_subscription_activated', 'Jedida AI Handler activated', $2)`,
    [req.user.id, `Your "${plan.name}" AI Handler subscription is now active.`]
  );

  res.status(201).json({ subscription: { ...result.rows[0], plan_code: plan.code, plan_name: plan.name } });
}

export async function cancelSubscription(req, res) {
  const result = await query(
    `UPDATE ai_handler_subscriptions SET status = 'cancelled', cancelled_at = now()
     WHERE business_user_id = $1 AND status = 'active' RETURNING *`,
    [req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'No active subscription to cancel.' });
  await query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'ai_handler_subscription_cancelled', 'Jedida AI Handler cancelled', 'Your AI Handler subscription has been cancelled.')`,
    [req.user.id]
  );
  res.json({ message: 'Subscription cancelled.', subscription: result.rows[0] });
}

// Enterprise-only: additional staff accounts that can act inside the AI
// Handler tools on behalf of the business.
export async function addStaffSeat(req, res) {
  const { staffUserId } = req.body;
  try {
    const sub = await requireFeature(req.user.id, 'multiple_staff_accounts');
    const seatCount = await query(`SELECT COUNT(*) AS n FROM ai_handler_staff_seats WHERE subscription_id = $1 AND status = 'active'`, [sub.id]);
    if (Number(seatCount.rows[0].n) >= sub.staff_seat_limit) {
      return res.status(400).json({ error: `Your plan allows up to ${sub.staff_seat_limit} staff seats.` });
    }
    const result = await query(
      `INSERT INTO ai_handler_staff_seats (subscription_id, staff_user_id, added_by) VALUES ($1,$2,$3)
       ON CONFLICT (subscription_id, staff_user_id) DO UPDATE SET status = 'active', removed_at = NULL
       RETURNING *`,
      [sub.id, staffUserId, req.user.id]
    );
    res.status(201).json({ seat: result.rows[0] });
  } catch (err) {
    handleGuardError(res, err);
  }
}

export async function removeStaffSeat(req, res) {
  const { seatId } = req.params;
  const result = await query(
    `UPDATE ai_handler_staff_seats s SET status = 'removed', removed_at = now()
     FROM ai_handler_subscriptions sub
     WHERE s.id = $1 AND s.subscription_id = sub.id AND sub.business_user_id = $2
     RETURNING s.*`,
    [seatId, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Seat not found.' });
  res.json({ message: 'Seat removed.' });
}

// ===========================================================================
// AI STORE MANAGEMENT
// ===========================================================================

async function myShop(req, res) {
  const result = await query('SELECT * FROM shops WHERE owner_id = $1 LIMIT 1', [req.user.id]);
  if (!result.rows[0]) {
    res.status(404).json({ error: 'You need a shop before using the AI Handler.' });
    return null;
  }
  return result.rows[0];
}

export async function storeDescription(req, res) {
  try {
    await requireFeature(req.user.id, 'store_suggestions');
    const shop = await myShop(req, res);
    if (!shop) return;
    const { businessDescription, overwriteDescription } = req.body;
    if (!businessDescription?.trim()) return res.status(400).json({ error: 'Describe your business in a sentence or two first.' });
    const design = await designStore({ shopId: shop.id, shopName: shop.name, businessDescription, overwriteDescription: !!overwriteDescription });
    await logAiHandlerAction({ businessUserId: req.user.id, actionType: 'store_description', actorId: req.user.id, metadata: { shopId: shop.id } });
    res.json({ design });
  } catch (err) { handleGuardError(res, err); }
}

export async function productAssist(req, res) {
  try {
    await requireFeature(req.user.id, 'product_assistance');
    const { title, description, category, price, currency, images, specs } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'A product title is required.' });
    // AI SECURITY RULES: never promise an unavailable product, never set a
    // price on its own — analyzeProduct only reviews/suggests; the owner
    // still has to save it through their normal product-edit flow.
    const analysis = await analyzeProduct({ title, description, category, price, currency, images, specs });
    await logAiHandlerAction({ businessUserId: req.user.id, actionType: 'product_assist', actorId: req.user.id, metadata: { title } });
    res.json({ analysis });
  } catch (err) { handleGuardError(res, err); }
}

export async function analytics(req, res) {
  try {
    await requireFeature(req.user.id, 'advanced_analytics');
    const shop = await myShop(req, res);
    if (!shop) return;
    const [salesAnalytics, performance] = await Promise.all([tausi.shopAnalytics(shop.id), tausi.sellerPerformance(shop.id)]);
    await logAiHandlerAction({ businessUserId: req.user.id, actionType: 'analytics_viewed', actorId: req.user.id });
    res.json({ analytics: salesAnalytics, performance });
  } catch (err) { handleGuardError(res, err); }
}

export async function marketingGenerate(req, res) {
  try {
    await requireFeature(req.user.id, 'marketing_automation');
    const shop = await myShop(req, res);
    if (!shop) return;
    const { productId, kind } = req.body;
    if (productId) {
      const owns = await query('SELECT id FROM products WHERE id = $1 AND shop_id = $2', [productId, shop.id]);
      if (!owns.rows[0]) return res.status(403).json({ error: 'That product is not in your shop.' });
    }
    const copy = await marketing.generateMarketingCopy({ shopId: shop.id, shopName: shop.name, productId, kind });
    await logAiHandlerAction({ businessUserId: req.user.id, actionType: 'marketing_generated', actorId: req.user.id, metadata: { productId, kind } });
    res.json({ copy });
  } catch (err) { handleGuardError(res, err); }
}

export async function salesInsights(req, res) {
  try {
    await requireFeature(req.user.id, 'sales_insights');
    const shop = await myShop(req, res);
    if (!shop) return;
    const result = await query(
      `SELECT p.id, p.title, COALESCE(SUM(o.quantity), 0) AS units_sold
       FROM products p
       LEFT JOIN orders o ON o.product_id = p.id AND o.status NOT IN ('cancelled', 'pending_payment')
       WHERE p.shop_id = $1
       GROUP BY p.id, p.title ORDER BY units_sold DESC LIMIT 10`,
      [shop.id]
    );
    await logAiHandlerAction({ businessUserId: req.user.id, actionType: 'sales_insights_viewed', actorId: req.user.id });
    res.json({ popularProducts: result.rows });
  } catch (err) { handleGuardError(res, err); }
}

// ===========================================================================
// AI CUSTOMER COMMUNICATION ASSISTANT
// ===========================================================================
// Drafts a reply for a buyer conversation already happening inside Jedida
// Chat. Never sends on the business's behalf and never accepts an order or
// payment — it returns text for the business (or their rep) to review and
// send. The underlying prompt (chat/aiAssistant.js) already refuses to
// share off-platform contact info or finalize deals; scanMessageText is
// run again here as a second, independent check before the draft is
// returned, since "conversations must remain inside Jedida chat."
export async function draftCustomerReply(req, res) {
  try {
    await requireFeature(req.user.id, 'customer_message_assistance');
    const { conversationId, message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required.' });

    const convResult = await query('SELECT * FROM chat_conversations WHERE id = $1 AND seller_id = $2', [conversationId, req.user.id]);
    const conversation = convResult.rows[0];
    if (!conversation) return res.status(404).json({ error: 'Conversation not found for your shop.' });

    const context = await fetchConversationContext(conversation);
    let replyText = await generateAssistantReply({ text: message, context });

    const scan = scanMessageText(replyText);
    if (scan?.maskedText) replyText = scan.maskedText;

    await logAiHandlerAction({ businessUserId: req.user.id, actionType: 'customer_reply_drafted', actorId: req.user.id, metadata: { conversationId } });
    res.json({ draftReply: replyText });
  } catch (err) { handleGuardError(res, err); }
}

// ===========================================================================
// AI SECURITY: explicit rejection endpoint hit-tester (used by the admin
// dashboard / QA to prove the guard rails work — not a real capability).
// ===========================================================================
export async function testForbiddenAction(req, res) {
  const { actionType } = req.body;
  try {
    assertAiActionAllowed(actionType);
    res.json({ allowed: true });
  } catch (err) {
    await logAiHandlerAction({ businessUserId: req.user.id, actionType, actorId: req.user.id, outcome: 'blocked' });
    handleGuardError(res, err);
  }
}

// ===========================================================================
// ADMIN OVERSIGHT
// ===========================================================================

export async function adminListSubscriptions(req, res) {
  const result = await query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name, u.full_name AS business_name, u.primary_role AS business_role
     FROM ai_handler_subscriptions s
     JOIN ai_handler_plans p ON p.id = s.plan_id
     JOIN users u ON u.id = s.business_user_id
     ORDER BY s.created_at DESC LIMIT 200`
  );
  res.json({ subscriptions: result.rows });
}

export async function adminActivityLog(req, res) {
  const { businessUserId } = req.query;
  const params = [];
  let where = `WHERE event_type LIKE 'ai_handler_%'`;
  if (businessUserId) { params.push(businessUserId); where += ` AND entity_id = $${params.length}`; }
  const result = await query(
    `SELECT * FROM platform_security_log ${where} ORDER BY created_at DESC LIMIT 300`,
    params
  );
  res.json({ log: result.rows });
}

export async function adminListPlans(req, res) {
  const result = await query('SELECT * FROM ai_handler_plans ORDER BY sort_order');
  res.json({ plans: result.rows });
}

export async function adminUpdatePlan(req, res) {
  const { id } = req.params;
  const { priceMonthly, features, staffSeatLimit, active } = req.body;
  const result = await query(
    `UPDATE ai_handler_plans SET
       price_monthly = COALESCE($2, price_monthly),
       features = COALESCE($3, features),
       staff_seat_limit = COALESCE($4, staff_seat_limit),
       active = COALESCE($5, active)
     WHERE id = $1 RETURNING *`,
    [id, priceMonthly ?? null, features ? JSON.stringify(features) : null, staffSeatLimit ?? null, active ?? null]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Plan not found.' });
  res.json({ plan: result.rows[0] });
}

// ---------------------------------------------------------------------------
// Complaints — about a representative or the AI Handler.
// ---------------------------------------------------------------------------

export async function fileComplaint(req, res) {
  const { againstType, againstRepresentativeId, againstBusinessUserId, subject, description } = req.body;
  if (!['representative', 'ai_handler'].includes(againstType)) {
    return res.status(400).json({ error: 'againstType must be "representative" or "ai_handler".' });
  }
  if (!subject?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'subject and description are required.' });
  }
  const result = await query(
    `INSERT INTO business_complaints (complainant_id, against_type, against_representative_id, against_business_user_id, subject, description)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.id, againstType, againstRepresentativeId || null, againstBusinessUserId || null, subject.trim(), description.trim()]
  );
  res.status(201).json({ complaint: result.rows[0] });
}

export async function adminListComplaints(req, res) {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE c.status = $${params.length}`; }
  const result = await query(
    `SELECT c.*, u.full_name AS complainant_name
     FROM business_complaints c JOIN users u ON u.id = c.complainant_id
     ${where} ORDER BY c.created_at DESC LIMIT 200`,
    params
  );
  res.json({ complaints: result.rows });
}

export async function adminResolveComplaint(req, res) {
  const { id } = req.params;
  const { status, resolutionNotes } = req.body;
  if (!['investigating', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'status must be "investigating", "resolved", or "dismissed".' });
  }
  const result = await query(
    `UPDATE business_complaints SET status = $2, resolved_by = $3, resolution_notes = $4,
       resolved_at = CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE resolved_at END
     WHERE id = $1 RETURNING *`,
    [id, status, req.user.id, resolutionNotes || null]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Complaint not found.' });

  if (['resolved', 'dismissed'].includes(status)) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'business_complaint_resolved', 'Your complaint has been reviewed', $2)`,
      [result.rows[0].complainant_id, `Your complaint "${result.rows[0].subject}" is now marked as ${status}.`]
    );
  }

  res.json({ complaint: result.rows[0] });
}
