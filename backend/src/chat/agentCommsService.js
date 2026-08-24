// agentCommsService.js
//
// Service layer for the Agent Communication Center (schema_phase86).
// Deliberately reuses chat_conversations/chat_messages and chatService.js's
// saveMessage/getMessages for anything customer-facing — this file only
// adds the agent-side routing, transfer, internal chat, notes and
// broadcast operations around it. See schema_phase86's header comment
// for the structural reasoning (why broadcasts fan out into ordinary
// private conversations, why internal chat is a separate table pair).
//
// Every function that mutates state throws an Error with .statusCode /
// .code set for permission or validation failures, matching the pattern
// controllers/aiHandlerController.js and chatService.js already use —
// callers just do `if (err.statusCode) res.status(err.statusCode)...`.

import { query, pool } from '../config/db.js';
import { saveMessage } from './chatService.js';

function forbidden(message, code) {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = code;
  return err;
}
function notFound(message, code) {
  const err = new Error(message);
  err.statusCode = 404;
  err.code = code;
  return err;
}
function badRequest(message, code) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Sectors & Groups — admin-configurable, never hard-coded (spec section 70)
// ---------------------------------------------------------------------------

export async function listSectors({ activeOnly = true } = {}) {
  const result = await query(
    `SELECT * FROM agent_sectors ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY name`
  );
  return result.rows;
}

export async function createSector({ name, description, createdBy }) {
  if (!name || !name.trim()) throw badRequest('Sector name is required.');
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const result = await query(
    `INSERT INTO agent_sectors (name, slug, description, created_by)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [name.trim(), slug, description || null, createdBy]
  );
  return result.rows[0];
}

export async function listGroups({ sectorId = null } = {}) {
  const result = await query(
    `SELECT g.*, s.name AS sector_name,
       (SELECT COUNT(*) FROM agent_group_members m WHERE m.group_id = g.id) AS member_count
     FROM agent_groups g
     LEFT JOIN agent_sectors s ON s.id = g.sector_id
     WHERE g.is_active = TRUE AND ($1::uuid IS NULL OR g.sector_id = $1)
     ORDER BY g.name`,
    [sectorId]
  );
  return result.rows;
}

export async function createGroup({ sectorId, name, description, teamLeadId, autoAssignmentEnabled, createdBy }) {
  if (!name || !name.trim()) throw badRequest('Group name is required.');
  const result = await query(
    `INSERT INTO agent_groups (sector_id, name, description, team_lead_id, auto_assignment_enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [sectorId || null, name.trim(), description || null, teamLeadId || null, Boolean(autoAssignmentEnabled), createdBy]
  );
  return result.rows[0];
}

export async function updateGroup(groupId, fields) {
  const allowed = ['name', 'description', 'team_lead_id', 'sector_id', 'auto_assignment_enabled', 'is_active', 'routing_config'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = $${i++}`);
    values.push(key === 'routing_config' ? JSON.stringify(value) : value);
  }
  if (!sets.length) throw badRequest('No valid fields to update.');
  values.push(groupId);
  const result = await query(
    `UPDATE agent_groups SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (!result.rows[0]) throw notFound('Group not found.');
  return result.rows[0];
}

export async function addGroupMember({ groupId, agentId, isTeamLead = false, skills = [], addedBy }) {
  const result = await query(
    `INSERT INTO agent_group_members (group_id, agent_id, is_team_lead, skills, added_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (group_id, agent_id) DO UPDATE SET is_team_lead = EXCLUDED.is_team_lead, skills = EXCLUDED.skills
     RETURNING *`,
    [groupId, agentId, isTeamLead, skills, addedBy]
  );
  return result.rows[0];
}

export async function removeGroupMember({ groupId, agentId }) {
  await query(`DELETE FROM agent_group_members WHERE group_id = $1 AND agent_id = $2`, [groupId, agentId]);
  return true;
}

export async function listAgentGroupsFor(agentId) {
  const result = await query(
    `SELECT g.*, m.is_team_lead, m.skills
     FROM agent_group_members m
     JOIN agent_groups g ON g.id = m.group_id
     WHERE m.agent_id = $1 AND g.is_active = TRUE`,
    [agentId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Agent directory & presence
// ---------------------------------------------------------------------------

export async function listAgents({ groupId = null, search = null } = {}) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.avatar_url, u.admin_role,
            COALESCE(p.presence, 'offline') AS presence, p.title,
            COALESCE(
              (SELECT json_agg(json_build_object('id', g.id, 'name', g.name))
               FROM agent_group_members m JOIN agent_groups g ON g.id = m.group_id
               WHERE m.agent_id = u.id), '[]'
            ) AS groups
     FROM users u
     LEFT JOIN agent_profiles p ON p.user_id = u.id
     WHERE u.is_admin = TRUE
       AND ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM agent_group_members m WHERE m.agent_id = u.id AND m.group_id = $1))
       AND ($2::text IS NULL OR u.full_name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
     ORDER BY u.full_name`,
    [groupId, search]
  );
  return result.rows;
}

export async function setPresence({ agentId, presence }) {
  const allowed = ['online', 'away', 'busy', 'offline'];
  if (!allowed.includes(presence)) throw badRequest('Invalid presence value.');
  const result = await query(
    `INSERT INTO agent_profiles (user_id, presence, presence_updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET presence = EXCLUDED.presence, presence_updated_at = now()
     RETURNING *`,
    [agentId, presence]
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Inbox / conversation routing
// ---------------------------------------------------------------------------

// filters: status, groupId, sectorId, priority, assignedToMe (agentId),
// unassignedOnly, search. All optional — an agent with no filters sees
// everything they're permitted to (server-side enforced, not a client flag).
export async function listInbox({
  status = null,
  groupId = null,
  sectorId = null,
  priority = null,
  assignedAgentId = null,
  unassignedOnly = false,
  search = null,
  limit = 50,
  offset = 0
}) {
  const result = await query(
    `SELECT c.*,
            u.full_name AS customer_name, u.avatar_url AS customer_avatar,
            au.full_name AS assigned_agent_name,
            g.name AS group_name, s.name AS sector_name,
            (SELECT body FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
            (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND status <> 'read' AND sender_id = c.user_id) AS unread_count
     FROM chat_conversations c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN users au ON au.id = c.assigned_agent_id
     LEFT JOIN agent_groups g ON g.id = c.agent_group_id
     LEFT JOIN agent_sectors s ON s.id = c.sector_id
     WHERE ($1::text IS NULL OR c.status = $1)
       AND ($2::uuid IS NULL OR c.agent_group_id = $2)
       AND ($3::uuid IS NULL OR c.sector_id = $3)
       AND ($4::text IS NULL OR c.priority = $4)
       AND ($5::uuid IS NULL OR c.assigned_agent_id = $5)
       AND (NOT $6::boolean OR c.assigned_agent_id IS NULL)
       AND ($7::text IS NULL OR u.full_name ILIKE '%' || $7 || '%')
     ORDER BY c.priority = 'urgent' DESC, c.priority = 'high' DESC, last_message_at DESC NULLS LAST
     LIMIT $8 OFFSET $9`,
    [status, groupId, sectorId, priority, assignedAgentId, unassignedOnly, search, limit, offset]
  );
  return result.rows;
}

export async function getConversationDetail(conversationId) {
  const result = await query(
    `SELECT c.*,
            u.full_name AS customer_name, u.avatar_url AS customer_avatar, u.email AS customer_email,
            u.location_city, u.location_country, u.kyc_status,
            au.full_name AS assigned_agent_name,
            g.name AS group_name, s.name AS sector_name
     FROM chat_conversations c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN users au ON au.id = c.assigned_agent_id
     LEFT JOIN agent_groups g ON g.id = c.agent_group_id
     LEFT JOIN agent_sectors s ON s.id = c.sector_id
     WHERE c.id = $1`,
    [conversationId]
  );
  if (!result.rows[0]) throw notFound('Conversation not found.');
  return result.rows[0];
}

export async function claimConversation({ conversationId, agentId }) {
  const result = await query(
    `UPDATE chat_conversations
     SET assigned_agent_id = $2, claimed_at = now()
     WHERE id = $1 AND assigned_agent_id IS NULL
     RETURNING *`,
    [conversationId, agentId]
  );
  if (!result.rows[0]) throw badRequest('This conversation has already been claimed by another agent.', 'ALREADY_CLAIMED');
  return result.rows[0];
}

export async function assignConversation({ conversationId, agentId, assignedBy }) {
  const conv = await getConversationDetail(conversationId);
  const result = await query(
    `UPDATE chat_conversations SET assigned_agent_id = $2, claimed_at = now() WHERE id = $1 RETURNING *`,
    [conversationId, agentId]
  );
  // Assignment (not a full transfer) still gets a lightweight audit row so
  // "who was ever responsible for this conversation" stays complete.
  await query(
    `INSERT INTO conversation_transfers (conversation_id, from_agent_id, to_agent_id, transfer_type, initiated_by, reason)
     VALUES ($1,$2,$3,'agent',$4,'assignment')`,
    [conversationId, conv.assigned_agent_id, agentId, assignedBy]
  );
  return result.rows[0];
}

export async function setPriority({ conversationId, priority, setBy }) {
  const allowed = ['low', 'normal', 'high', 'urgent'];
  if (!allowed.includes(priority)) throw badRequest('Invalid priority.');
  const result = await query(
    `UPDATE chat_conversations SET priority = $2 WHERE id = $1 RETURNING *`,
    [conversationId, priority]
  );
  if (!result.rows[0]) throw notFound('Conversation not found.');
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Transfers — history preserved, conversation id never changes
// (schema_phase86 header + spec sections 15-17)
// ---------------------------------------------------------------------------

export async function transferConversation({
  conversationId,
  toAgentId = null,
  toGroupId = null,
  transferType = 'agent',
  reason = null,
  note = null,
  initiatedBy,
  requiresApproval = false
}) {
  if (!toAgentId && !toGroupId) throw badRequest('Provide a destination agent or group to transfer to.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM chat_conversations WHERE id = $1 FOR UPDATE', [conversationId]);
    if (!current.rows[0]) throw notFound('Conversation not found.');
    const conv = current.rows[0];

    let toSectorId = conv.sector_id;
    if (toGroupId) {
      const group = await client.query('SELECT sector_id FROM agent_groups WHERE id = $1', [toGroupId]);
      if (!group.rows[0]) throw notFound('Destination group not found.');
      toSectorId = group.rows[0].sector_id;
    }

    const updated = await client.query(
      `UPDATE chat_conversations
       SET assigned_agent_id = $2, agent_group_id = $3, sector_id = $4,
           last_transferred_at = now(), status = 'open'
       WHERE id = $1 RETURNING *`,
      [conversationId, toAgentId, toGroupId || conv.agent_group_id, toSectorId]
    );

    const transferRow = await client.query(
      `INSERT INTO conversation_transfers
         (conversation_id, from_agent_id, to_agent_id, from_group_id, to_group_id,
          transfer_type, reason, note, initiated_by, requires_approval)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        conversationId, conv.assigned_agent_id, toAgentId, conv.agent_group_id, toGroupId || null,
        transferType, reason, note, initiatedBy, requiresApproval
      ]
    );

    await client.query('COMMIT');
    return { conversation: updated.rows[0], transfer: transferRow.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getTransferHistory(conversationId) {
  const result = await query(
    `SELECT t.*, fa.full_name AS from_agent_name, ta.full_name AS to_agent_name,
            fg.name AS from_group_name, tg.name AS to_group_name
     FROM conversation_transfers t
     LEFT JOIN users fa ON fa.id = t.from_agent_id
     LEFT JOIN users ta ON ta.id = t.to_agent_id
     LEFT JOIN agent_groups fg ON fg.id = t.from_group_id
     LEFT JOIN agent_groups tg ON tg.id = t.to_group_id
     WHERE t.conversation_id = $1
     ORDER BY t.created_at DESC`,
    [conversationId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Internal notes — never visible to the customer (spec section 25)
// ---------------------------------------------------------------------------

export async function addInternalNote({ conversationId, authorId, body }) {
  if (!body || !body.trim()) throw badRequest('Note body is required.');
  const result = await query(
    `INSERT INTO internal_notes (conversation_id, author_id, body) VALUES ($1,$2,$3) RETURNING *`,
    [conversationId, authorId, body.trim()]
  );
  return result.rows[0];
}

export async function listInternalNotes(conversationId) {
  const result = await query(
    `SELECT n.*, u.full_name AS author_name
     FROM internal_notes n JOIN users u ON u.id = n.author_id
     WHERE n.conversation_id = $1 ORDER BY n.created_at ASC`,
    [conversationId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Internal chat — agent<->agent and group rooms. Structurally separate
// from customer chat (no customer_id column exists on these tables at
// all — see schema_phase86 header).
// ---------------------------------------------------------------------------

async function requireAgent(userId) {
  const result = await query('SELECT is_admin FROM users WHERE id = $1', [userId]);
  if (!result.rows[0]?.is_admin) throw forbidden('Only agents can use internal chat.', 'NOT_AN_AGENT');
}

export async function getOrCreateDm({ agentAId, agentBId }) {
  if (agentAId === agentBId) throw badRequest('Cannot start a conversation with yourself.');
  await requireAgent(agentAId);
  await requireAgent(agentBId);
  const [lo, hi] = [agentAId, agentBId].sort();
  const existing = await query(
    `SELECT * FROM internal_conversations
     WHERE is_group = FALSE
       AND LEAST(participant_one_id, participant_two_id) = $1
       AND GREATEST(participant_one_id, participant_two_id) = $2`,
    [lo, hi]
  );
  if (existing.rows[0]) return existing.rows[0];
  const result = await query(
    `INSERT INTO internal_conversations (is_group, participant_one_id, participant_two_id)
     VALUES (FALSE, $1, $2) RETURNING *`,
    [agentAId, agentBId]
  );
  return result.rows[0];
}

export async function getOrCreateGroupRoom(groupId) {
  const existing = await query(`SELECT * FROM internal_conversations WHERE is_group = TRUE AND group_id = $1`, [groupId]);
  if (existing.rows[0]) return existing.rows[0];
  const result = await query(
    `INSERT INTO internal_conversations (is_group, group_id) VALUES (TRUE, $1) RETURNING *`,
    [groupId]
  );
  return result.rows[0];
}

// Server-side membership check — the actual visibility guarantee, not
// just a UI filter (spec section 66: "server must enforce permissions").
async function assertInternalConversationAccess(internalConversationId, agentId) {
  const result = await query(
    `SELECT ic.*,
       CASE
         WHEN ic.is_group THEN EXISTS (SELECT 1 FROM agent_group_members m WHERE m.group_id = ic.group_id AND m.agent_id = $2)
         ELSE ic.participant_one_id = $2 OR ic.participant_two_id = $2
       END AS has_access
     FROM internal_conversations ic WHERE ic.id = $1`,
    [internalConversationId, agentId]
  );
  const row = result.rows[0];
  if (!row) throw notFound('Internal conversation not found.');
  if (!row.has_access) throw forbidden('You are not a participant in this conversation.', 'NOT_A_PARTICIPANT');
  return row;
}

export async function listMyInternalConversations(agentId) {
  const result = await query(
    `SELECT ic.*,
       CASE WHEN ic.is_group THEN g.name ELSE ou.full_name END AS display_name,
       CASE WHEN ic.is_group THEN NULL ELSE ou.avatar_url END AS display_avatar,
       (SELECT body FROM internal_messages WHERE internal_conversation_id = ic.id ORDER BY created_at DESC LIMIT 1) AS last_message,
       (SELECT created_at FROM internal_messages WHERE internal_conversation_id = ic.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
       (SELECT COUNT(*) FROM internal_messages im WHERE im.internal_conversation_id = ic.id AND NOT ($3 = ANY(im.read_by)) AND im.sender_id <> $3) AS unread_count
     FROM internal_conversations ic
     LEFT JOIN agent_groups g ON g.id = ic.group_id
     LEFT JOIN users ou ON ou.id = (CASE WHEN ic.participant_one_id = $3 THEN ic.participant_two_id ELSE ic.participant_one_id END)
     WHERE (ic.is_group AND EXISTS (SELECT 1 FROM agent_group_members m WHERE m.group_id = ic.group_id AND m.agent_id = $3))
        OR (NOT ic.is_group AND (ic.participant_one_id = $3 OR ic.participant_two_id = $3))
     ORDER BY last_message_at DESC NULLS LAST`,
    [null, null, agentId]
  );
  return result.rows;
}

export async function sendInternalMessage({ internalConversationId, senderId, body, attachmentUrl = null, attachmentMeta = {}, mentionedAgentIds = [] }) {
  await assertInternalConversationAccess(internalConversationId, senderId);
  if (!body || !body.trim()) throw badRequest('Message body is required.');
  const result = await query(
    `INSERT INTO internal_messages (internal_conversation_id, sender_id, body, attachment_url, attachment_meta, mentioned_agent_ids, read_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [internalConversationId, senderId, body.trim(), attachmentUrl, JSON.stringify(attachmentMeta), mentionedAgentIds, [senderId]]
  );
  const message = result.rows[0];

  for (const mentionedId of mentionedAgentIds) {
    if (mentionedId === senderId) continue;
    await query(
      `INSERT INTO agent_mentions (mentioned_agent_id, mentioned_by_id, internal_message_id)
       VALUES ($1,$2,$3)`,
      [mentionedId, senderId, message.id]
    );
  }
  return message;
}

export async function listInternalMessages({ internalConversationId, agentId, limit = 50, before = null }) {
  await assertInternalConversationAccess(internalConversationId, agentId);
  const result = await query(
    `SELECT im.*, u.full_name AS sender_name, u.avatar_url AS sender_avatar
     FROM internal_messages im JOIN users u ON u.id = im.sender_id
     WHERE im.internal_conversation_id = $1 AND ($2::timestamptz IS NULL OR im.created_at < $2)
     ORDER BY im.created_at DESC LIMIT $3`,
    [internalConversationId, before, limit]
  );
  return result.rows.reverse();
}

export async function markInternalRead({ internalConversationId, agentId }) {
  await assertInternalConversationAccess(internalConversationId, agentId);
  await query(
    `UPDATE internal_messages SET read_by = array_append(read_by, $2)
     WHERE internal_conversation_id = $1 AND NOT ($2 = ANY(read_by))`,
    [internalConversationId, agentId]
  );
  return true;
}

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

export async function listMyMentions({ agentId, unreadOnly = false }) {
  const result = await query(
    `SELECT am.*, u.full_name AS mentioned_by_name,
            im.body AS message_body, im.internal_conversation_id
     FROM agent_mentions am
     JOIN users u ON u.id = am.mentioned_by_id
     LEFT JOIN internal_messages im ON im.id = am.internal_message_id
     WHERE am.mentioned_agent_id = $1 AND (NOT $2::boolean OR am.is_read = FALSE)
     ORDER BY am.created_at DESC LIMIT 100`,
    [agentId, unreadOnly]
  );
  return result.rows;
}

export async function markMentionRead({ mentionId, agentId }) {
  const result = await query(
    `UPDATE agent_mentions SET is_read = TRUE WHERE id = $1 AND mentioned_agent_id = $2 RETURNING *`,
    [mentionId, agentId]
  );
  if (!result.rows[0]) throw notFound('Mention not found.');
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Broadcasts — fan out into ordinary private conversations. See
// schema_phase86 header: there is no code path here that ever returns
// a recipient list to a customer, because customers never call any of
// this file's functions — only agent-gated routes do.
// ---------------------------------------------------------------------------

async function resolveBroadcastAudience({ audienceType, audienceGroupId, audienceSectorId, customerIds }) {
  if (audienceType === 'selected') {
    if (!Array.isArray(customerIds) || !customerIds.length) throw badRequest('Provide at least one recipient.');
    return customerIds;
  }
  if (audienceType === 'all') {
    const result = await query(`SELECT id FROM users WHERE is_admin = FALSE AND status = 'active'`);
    return result.rows.map((r) => r.id);
  }
  if (audienceType === 'group') {
    if (!audienceGroupId) throw badRequest('audienceGroupId is required for a group broadcast.');
    // A group's "customers" are those with an open/assigned conversation
    // routed to that group — the same population the agent already sees
    // in their inbox, not an unrelated global list.
    const result = await query(
      `SELECT DISTINCT user_id AS id FROM chat_conversations WHERE agent_group_id = $1`,
      [audienceGroupId]
    );
    return result.rows.map((r) => r.id);
  }
  if (audienceType === 'sector') {
    if (!audienceSectorId) throw badRequest('audienceSectorId is required for a sector broadcast.');
    const result = await query(
      `SELECT DISTINCT user_id AS id FROM chat_conversations WHERE sector_id = $1`,
      [audienceSectorId]
    );
    return result.rows.map((r) => r.id);
  }
  throw badRequest('Invalid audienceType.');
}

// Admin permission check reuses the existing role_permissions table
// (phase37) rather than new plumbing — permission strings look like
// 'broadcast:group' | 'broadcast:sector' | 'broadcast:selected' |
// 'broadcast:all'. A super admin (no admin_role, or admin_role =
// super_admin) always passes, matching requirePermission()'s convention
// in middleware/auth.js.
async function assertBroadcastPermission(senderId, audienceType) {
  const user = await query('SELECT is_admin, admin_role FROM users WHERE id = $1', [senderId]);
  const row = user.rows[0];
  if (!row?.is_admin) throw forbidden('Only agents can send broadcasts.', 'NOT_AN_AGENT');
  if (!row.admin_role || row.admin_role === 'super_admin') return;
  const perm = await query(
    `SELECT allowed FROM role_permissions WHERE user_id = $1 AND permission = $2`,
    [senderId, `broadcast:${audienceType}`]
  );
  if (!perm.rows[0]?.allowed) {
    throw forbidden(`You do not have permission to send a ${audienceType} broadcast.`, 'BROADCAST_NOT_PERMITTED');
  }
}

export async function sendBroadcast({ senderId, audienceType, audienceGroupId = null, audienceSectorId = null, customerIds = [], messageBody, attachmentUrl = null }) {
  if (!messageBody || !messageBody.trim()) throw badRequest('Broadcast message is required.');
  await assertBroadcastPermission(senderId, audienceType);
  const recipients = await resolveBroadcastAudience({ audienceType, audienceGroupId, audienceSectorId, customerIds });

  const broadcastResult = await query(
    `INSERT INTO broadcasts (sender_id, audience_type, audience_group_id, audience_sector_id, audience_count, message_body, attachment_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'sending') RETURNING *`,
    [senderId, audienceType, audienceGroupId, audienceSectorId, recipients.length, messageBody.trim(), attachmentUrl]
  );
  const broadcast = broadcastResult.rows[0];

  // Import lazily to avoid a require cycle (chatService <-> agentCommsService
  // never actually cycles, but keeping the import local to this function
  // makes that guarantee explicit).
  const { getOrCreateConversation } = await import('./chatService.js');

  let delivered = 0;
  let failed = 0;
  for (const customerId of recipients) {
    try {
      const conversation = await getOrCreateConversation({ userId: customerId, sellerId: senderId });
      await query(
        `UPDATE chat_conversations SET source_broadcast_id = $2, agent_group_id = COALESCE(agent_group_id, $3), sector_id = COALESCE(sector_id, $4)
         WHERE id = $1`,
        [conversation.id, broadcast.id, audienceGroupId, audienceSectorId]
      );
      const message = await saveMessage({
        conversationId: conversation.id,
        userId: customerId,
        senderId,
        body: messageBody.trim(),
        isOfficial: true,
        attachmentUrl
      });
      await query(
        `INSERT INTO broadcast_recipients (broadcast_id, customer_id, conversation_id, message_id, delivery_status)
         VALUES ($1,$2,$3,$4,'delivered')
         ON CONFLICT (broadcast_id, customer_id) DO NOTHING`,
        [broadcast.id, customerId, conversation.id, message.id]
      );
      delivered++;
    } catch (err) {
      await query(
        `INSERT INTO broadcast_recipients (broadcast_id, customer_id, delivery_status, failure_reason)
         VALUES ($1,$2,'failed',$3)
         ON CONFLICT (broadcast_id, customer_id) DO NOTHING`,
        [broadcast.id, customerId, err.message]
      );
      failed++;
    }
  }

  const finalStatus = failed === 0 ? 'sent' : (delivered === 0 ? 'failed' : 'sent');
  const updated = await query(
    `UPDATE broadcasts SET status = $2, sent_at = now() WHERE id = $1 RETURNING *`,
    [broadcast.id, finalStatus]
  );
  return { broadcast: updated.rows[0], delivered, failed, total: recipients.length };
}

export async function getBroadcastStatus(broadcastId) {
  const broadcast = await query('SELECT * FROM broadcasts WHERE id = $1', [broadcastId]);
  if (!broadcast.rows[0]) throw notFound('Broadcast not found.');
  const recipients = await query(
    `SELECT br.*, u.full_name AS customer_name
     FROM broadcast_recipients br JOIN users u ON u.id = br.customer_id
     WHERE br.broadcast_id = $1 ORDER BY br.created_at`,
    [broadcastId]
  );
  const stats = recipients.rows.reduce(
    (acc, r) => {
      acc[r.delivery_status] = (acc[r.delivery_status] || 0) + 1;
      if (r.read_at) acc.read++;
      if (r.replied_at) acc.replied++;
      return acc;
    },
    { delivered: 0, pending: 0, failed: 0, read: 0, replied: 0 }
  );
  return { broadcast: broadcast.rows[0], recipients: recipients.rows, stats };
}

export async function listBroadcasts(senderId) {
  const result = await query(
    `SELECT b.*, g.name AS group_name, s.name AS sector_name
     FROM broadcasts b
     LEFT JOIN agent_groups g ON g.id = b.audience_group_id
     LEFT JOIN agent_sectors s ON s.id = b.audience_sector_id
     WHERE b.sender_id = $1 ORDER BY b.created_at DESC LIMIT 100`,
    [senderId]
  );
  return result.rows;
}

// Called when a customer replies inside a broadcast-sourced conversation
// (spec section 20) — a plain saveMessage() already routes the reply
// back into that customer's own conversation since it's just an ordinary
// chat_conversations row; this only updates the delivery record so the
// agent's broadcast report shows the reply.
export async function recordBroadcastReply({ conversationId }) {
  await query(
    `UPDATE broadcast_recipients SET replied_at = now()
     WHERE conversation_id = $1 AND replied_at IS NULL`,
    [conversationId]
  );
}

// ---------------------------------------------------------------------------
// Reporting — a light summary; deeper analytics belongs in a dedicated
// reports module once the rest of the surface is in use.
// ---------------------------------------------------------------------------

export async function getInboxSummary() {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open') AS open,
       COUNT(*) FILTER (WHERE status = 'open' AND assigned_agent_id IS NULL) AS unassigned,
       COUNT(*) FILTER (WHERE status = 'closed') AS resolved,
       COUNT(*) FILTER (WHERE priority = 'urgent' AND status = 'open') AS urgent
     FROM chat_conversations`
  );
  return result.rows[0];
}
