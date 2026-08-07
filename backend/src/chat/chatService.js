import { query } from '../config/db.js';

// Stage 5 — "Manufacturers and Suppliers can communicate with: Buyers,
// Approved dropshippers, Sellers, Jedida representatives." Buyers/sellers/
// reps are always free to open a conversation; a dropshipper<->manufacturer
// or dropshipper<->supplier conversation additionally requires an approved
// partnership row (dropship_partnerships, schema_phase42). Only gates
// *new* conversations — an already-open thread stays open even if a
// partnership is later revoked, so history/dispute context isn't lost.
async function assertBusinessChatAllowed(userId, sellerId) {
  if (!sellerId || userId === sellerId) return;
  const rolesResult = await query(
    `SELECT id, primary_role FROM users WHERE id = ANY($1::uuid[])`,
    [[userId, sellerId]]
  );
  const roleById = Object.fromEntries(rolesResult.rows.map((r) => [r.id, r.primary_role]));
  const roleA = roleById[userId];
  const roleB = roleById[sellerId];

  const dropshipperId = roleA === 'dropshipper' ? userId : roleB === 'dropshipper' ? sellerId : null;
  const businessId = roleA === 'dropshipper' ? sellerId : roleB === 'dropshipper' ? userId : null;
  const businessRole = businessId === sellerId ? roleB : roleA;

  if (!dropshipperId || !businessId || !['manufacturer', 'supplier'].includes(businessRole)) return; // not a dropshipper<->business pair — no gate

  const partnership = await query(
    `SELECT status FROM dropship_partnerships WHERE dropshipper_id = $1 AND business_id = $2 AND status = 'approved'`,
    [dropshipperId, businessId]
  );
  if (!partnership.rows[0]) {
    const err = new Error('You need an approved dropship partnership with this business before you can message them.');
    err.statusCode = 403;
    err.code = 'DROPSHIP_PARTNERSHIP_REQUIRED';
    throw err;
  }
}

export async function getOrCreateConversation({
  userId,
  sellerId = null,
  orderId = null,
  productId = null
}) {

const existing = await query(
`
SELECT *
FROM chat_conversations
WHERE user_id=$1
AND product_id IS NOT DISTINCT FROM $2
AND status='open'
ORDER BY created_at DESC
LIMIT 1
`,
[
 userId,
 productId
]
);

  if (existing.rows.length) {
    return existing.rows[0];
  }

  await assertBusinessChatAllowed(userId, sellerId);

  const result = await query(
    `
    INSERT INTO chat_conversations
    (
      user_id,
      seller_id,
      order_id,
      product_id
    )
    VALUES($1,$2,$3,$4)
    RETURNING *
    `,
    [
      userId,
      sellerId,
      orderId,
      productId
    ]
  );


  return result.rows[0];
}



export async function saveMessage({
  conversationId,
  userId,
  senderId,
  body,
  messageType = 'text',
  replyToId = null,
  moderationStatus = 'clean',
  originalBody = null,
  isOfficial = false,
  isAi = false,
  attachmentUrl = null,
  attachmentMeta = {},
  forwardedFromId = null
}) {

  const result = await query(
    `
    INSERT INTO chat_messages
    (
      conversation_id,
      user_id,
      sender_id,
      body,
      message_type,
      reply_to_id,
      moderation_status,
      original_body,
      is_official,
      is_ai,
      attachment_url,
      attachment_meta,
      forwarded_from_id
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
    `,
    [
      conversationId,
      userId,
      senderId,
      body,
      messageType,
      replyToId,
      moderationStatus,
      originalBody,
      isOfficial,
      isAi,
      attachmentUrl,
      JSON.stringify(attachmentMeta || {}),
      forwardedFromId
    ]
  );


  return result.rows[0];
}



export async function getMessages(conversationId){

  const result = await query(
    `
    SELECT *
    FROM chat_messages
    WHERE conversation_id=$1
    ORDER BY created_at ASC
    `,
    [
      conversationId
    ]
  );


  return result.rows;
}

export async function markMessagesRead({ conversationId, readerId }) {
  // A reader marks read everything in the conversation they didn't send.
  const result = await query(
    `
    UPDATE chat_messages
    SET status = 'read', read_at = now()
    WHERE conversation_id = $1 AND sender_id <> $2 AND status <> 'read'
    RETURNING id
    `,
    [conversationId, readerId]
  );
  return result.rows.map((r) => r.id);
}

export async function reactToMessage({ messageId, userId, emoji }) {
  // reactions is a JSONB map of emoji -> array of userIds who reacted with it.
  const result = await query(
    `
    UPDATE chat_messages
    SET reactions = jsonb_set(
      reactions,
      ARRAY[$2],
      COALESCE(reactions->$2, '[]'::jsonb) ||
        CASE WHEN (reactions->$2) @> to_jsonb($3::text)
          THEN '[]'::jsonb
          ELSE to_jsonb(ARRAY[$3]::text[])
        END,
      true
    )
    WHERE id = $1
    RETURNING *
    `,
    [messageId, emoji, userId]
  );
  return result.rows[0];
}

export async function editMessage({ messageId, senderId, newBody }) {
  const result = await query(
    `
    UPDATE chat_messages
    SET body = $3, edited_at = now()
    WHERE id = $1 AND sender_id = $2 AND deleted_for_everyone = FALSE
    RETURNING *
    `,
    [messageId, senderId, newBody]
  );
  return result.rows[0] || null;
}

export async function deleteMessageForEveryone({ messageId, senderId }) {
  const result = await query(
    `
    UPDATE chat_messages
    SET deleted_for_everyone = TRUE, body = ''
    WHERE id = $1 AND sender_id = $2
    RETURNING *
    `,
    [messageId, senderId]
  );
  return result.rows[0] || null;
}

export async function getUserLanguage(userId) {
  const result = await query('SELECT preferred_language FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.preferred_language || 'en';
}

export async function cacheMessageTranslation({ messageId, langKey, text }) {
  const result = await query(
    `
    UPDATE chat_messages
    SET translations = jsonb_set(translations, ARRAY[$2], to_jsonb($3::text), true)
    WHERE id = $1
    RETURNING *
    `,
    [messageId, langKey, text]
  );
  return result.rows[0] || null;
}

export async function setMessagePinned({ messageId, conversationId, pinned }) {
  const result = await query(
    `UPDATE chat_messages SET pinned = $3 WHERE id = $1 AND conversation_id = $2 RETURNING *`,
    [messageId, conversationId, pinned]
  );
  return result.rows[0] || null;
}

export async function getPinnedMessages(conversationId) {
  const result = await query(
    `SELECT * FROM chat_messages WHERE conversation_id = $1 AND pinned = TRUE ORDER BY created_at ASC`,
    [conversationId]
  );
  return result.rows;
}

export async function searchMessages(conversationId, term) {
  const result = await query(
    `
    SELECT * FROM chat_messages
    WHERE conversation_id = $1 AND deleted_for_everyone = FALSE AND body ILIKE $2
    ORDER BY created_at ASC
    `,
    [conversationId, `%${term}%`]
  );
  return result.rows;
}

export async function closeConversation(conversationId) {
  const result = await query(
    `UPDATE chat_conversations SET status = 'closed' WHERE id = $1 RETURNING *`,
    [conversationId]
  );
  return result.rows[0] || null;
}

export async function getConversationById(conversationId) {
  const result = await query('SELECT * FROM chat_conversations WHERE id = $1', [conversationId]);
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

export async function blockUser({ blockerId, blockedId, reason }) {
  const result = await query(
    `INSERT INTO chat_blocks (blocker_id, blocked_id, reason)
     VALUES ($1,$2,$3)
     ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET reason = EXCLUDED.reason
     RETURNING *`,
    [blockerId, blockedId, reason || null]
  );
  return result.rows[0];
}

export async function unblockUser({ blockerId, blockedId }) {
  await query('DELETE FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
  return true;
}

export async function isBlockedEitherWay(userAId, userBId) {
  if (!userAId || !userBId) return false;
  const result = await query(
    `SELECT 1 FROM chat_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userAId, userBId]
  );
  return result.rows.length > 0;
}

export async function listBlockedUsers(blockerId) {
  const result = await query(
    `SELECT b.blocked_id, u.full_name, u.avatar_url, b.created_at
     FROM chat_blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [blockerId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export async function reportMessage({ messageId, conversationId, reporterId, reportedUserId, reason, details }) {
  const result = await query(
    `INSERT INTO chat_reports (message_id, conversation_id, reporter_id, reported_user_id, reason, details)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [messageId || null, conversationId || null, reporterId, reportedUserId || null, reason, details || null]
  );
  return result.rows[0];
}

export async function listReports({ status } = {}) {
  const values = [];
  let where = '';
  if (status) { values.push(status); where = 'WHERE r.status = $1'; }
  const result = await query(
    `SELECT r.*, m.body AS message_body, m.original_body, reporter.full_name AS reporter_name
     FROM chat_reports r
     LEFT JOIN chat_messages m ON m.id = r.message_id
     JOIN users reporter ON reporter.id = r.reporter_id
     ${where}
     ORDER BY r.created_at DESC LIMIT 200`,
    values
  );
  return result.rows;
}

export async function updateReportStatus({ reportId, status, reviewedBy }) {
  const result = await query(
    `UPDATE chat_reports SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1 RETURNING *`,
    [reportId, status, reviewedBy]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Pin / archive conversations (per-viewer)
// ---------------------------------------------------------------------------

export async function setConversationState({ conversationId, userId, pinned, archived }) {
  const result = await query(
    `INSERT INTO chat_conversation_states (conversation_id, user_id, pinned, archived, updated_at)
     VALUES ($1,$2, COALESCE($3, FALSE), COALESCE($4, FALSE), now())
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET
       pinned = COALESCE($3, chat_conversation_states.pinned),
       archived = COALESCE($4, chat_conversation_states.archived),
       updated_at = now()
     RETURNING *`,
    [conversationId, userId, pinned ?? null, archived ?? null]
  );
  return result.rows[0];
}

export async function listConversationsForUser(userId) {
  const result = await query(
    `SELECT c.*, s.pinned, s.archived,
       CASE WHEN c.user_id = $1 THEN c.seller_id ELSE c.user_id END AS other_user_id
     FROM chat_conversations c
     LEFT JOIN chat_conversation_states s ON s.conversation_id = c.id AND s.user_id = $1
     WHERE c.user_id = $1 OR c.seller_id = $1
     ORDER BY COALESCE(s.pinned, FALSE) DESC, c.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getMessageById(messageId) {
  const result = await query('SELECT * FROM chat_messages WHERE id = $1', [messageId]);
  return result.rows[0] || null;
}

// Forwards an existing message (text or attachment) into a different
// conversation the forwarder is also a participant in. The forwarded copy
// carries forwarded_from_id so the UI can show a "Forwarded" label; it does
// NOT copy original_body/moderation flags from the source — it's scanned
// fresh, since a masked source shouldn't leak its original text via forward.
export async function forwardMessage({ sourceMessageId, targetConversationId, userId }) {
  const source = await getMessageById(sourceMessageId);
  if (!source) throw new Error('Original message not found');
  if (source.deleted_for_everyone) throw new Error('Cannot forward a deleted message');

  const result = await query(
    `
    INSERT INTO chat_messages
    (conversation_id, user_id, sender_id, body, message_type, attachment_url, attachment_meta, forwarded_from_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      targetConversationId,
      userId,
      userId,
      source.body,
      source.message_type,
      source.attachment_url,
      source.attachment_meta || {},
      source.id
    ]
  );
  return result.rows[0];
}

export async function getBridgeById(linkId) {
  const result = await query('SELECT * FROM chat_bridges WHERE id = $1', [linkId]);
  return result.rows[0] || null;
}


export async function createBridge({
  buyerConversationId,
  sellerConversationId,
  adminId,
  reason
}){

  const result = await query(
    `
    INSERT INTO chat_bridges
    (
      buyer_conversation_id,
      seller_conversation_id,
      admin_id,
      reason
    )
    VALUES($1,$2,$3,$4)
    RETURNING *
    `,
    [
      buyerConversationId,
      sellerConversationId,
      adminId,
      reason
    ]
  );


  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Stage 5 — Admin Security Center views. Blocked messages, suspicious
// conversations, and per-user moderation history, so admin doesn't have to
// query chat_moderation_events by hand. Reads only — moderation itself
// happens in contactModerationEngine.js.
// ---------------------------------------------------------------------------

export async function listBlockedMessages({ limit = 100 } = {}) {
  const result = await query(
    `SELECT m.id AS message_id, m.conversation_id, m.user_id, m.original_body, m.created_at,
            u.full_name, u.email, u.primary_role, u.chat_risk_score
     FROM chat_messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.moderation_status = 'blocked'
     ORDER BY m.created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// Conversations with 2+ moderation events — a stronger signal than a single
// slip, surfaced separately from the raw blocked-message list.
export async function listSuspiciousConversations({ minEvents = 2, limit = 100 } = {}) {
  const result = await query(
    `SELECT e.conversation_id, COUNT(*)::int AS event_count,
            COUNT(*) FILTER (WHERE e.action = 'block')::int AS block_count,
            MAX(e.created_at) AS last_event_at,
            array_agg(DISTINCT u.full_name) AS involved_users
     FROM chat_moderation_events e
     JOIN users u ON u.id = e.user_id
     GROUP BY e.conversation_id
     HAVING COUNT(*) >= $1
     ORDER BY MAX(e.created_at) DESC LIMIT $2`,
    [minEvents, limit]
  );
  return result.rows;
}

// A single user's moderation timeline — every event plus their current
// chat_risk_score, for the "Account trust score impact" admin view.
export async function getUserModerationHistory(userId) {
  const [userResult, eventsResult] = await Promise.all([
    query('SELECT id, full_name, email, primary_role, chat_risk_score FROM users WHERE id = $1', [userId]),
    query(
      `SELECT id, conversation_id, message_id, action, categories, details, created_at
       FROM chat_moderation_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId]
    ),
  ]);
  if (!userResult.rows[0]) return null;
  return { user: userResult.rows[0], events: eventsResult.rows };
}

// Headline numbers for the Security Center's chat-protection card.
export async function getModerationSummary() {
  const [blocked24h, masked24h, blocked7d, masked7d, riskUsers, byCategory] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM chat_moderation_events WHERE action = 'block' AND created_at > now() - interval '24 hours'`),
    query(`SELECT COUNT(*)::int AS n FROM chat_moderation_events WHERE action = 'mask' AND created_at > now() - interval '24 hours'`),
    query(`SELECT COUNT(*)::int AS n FROM chat_moderation_events WHERE action = 'block' AND created_at > now() - interval '7 days'`),
    query(`SELECT COUNT(*)::int AS n FROM chat_moderation_events WHERE action = 'mask' AND created_at > now() - interval '7 days'`),
    query(`SELECT COUNT(*)::int AS n FROM users WHERE chat_risk_score >= 60`),
    query(
      `SELECT category, COUNT(*)::int AS n
       FROM chat_moderation_events, jsonb_array_elements_text(categories) AS category
       WHERE created_at > now() - interval '7 days'
       GROUP BY category ORDER BY n DESC`
    ),
  ]);
  return {
    blockedLast24h: blocked24h.rows[0].n,
    maskedLast24h: masked24h.rows[0].n,
    blockedLast7d: blocked7d.rows[0].n,
    maskedLast7d: masked7d.rows[0].n,
    usersAtHighRisk: riskUsers.rows[0].n,
    violationsByCategory: byCategory.rows,
  };
}
