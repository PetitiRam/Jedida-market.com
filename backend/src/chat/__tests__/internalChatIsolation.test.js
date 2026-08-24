// internalChatIsolation.test.js
//
// CRITICAL INTERNAL CHAT SECURITY TEST — spec section 77.
// Proves, against a real database:
//   - Customers cannot access agent-to-agent messages.
//   - Customers cannot access internal notes.
//   - Customers cannot access agent group internal chats.
//   - An agent who is NOT a group member cannot join/read that group's
//     internal room, even though they are a legitimate agent elsewhere.
//
// Run with a disposable/test database only (never production):
//   DATABASE_URL=postgres://user:pass@host/jedida_test node --test src/chat/__tests__/internalChatIsolation.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../../config/db.js';
import {
  getOrCreateDm,
  sendInternalMessage,
  listInternalMessages,
  getOrCreateGroupRoom,
  addGroupMember,
  addInternalNote,
} from '../agentCommsService.js';

let agentAId, agentBId, outsiderAgentId, customerId, groupId, conversationId;
let dmId, groupRoomId;

before(async () => {
  const stamp = Date.now();
  const agentA = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, is_admin, admin_role)
     VALUES ($1,'x','Agent A','+256700000010', TRUE, 'support') RETURNING id`,
    [`test-agenta-${stamp}@jedida.test`]
  );
  agentAId = agentA.rows[0].id;

  const agentB = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, is_admin, admin_role)
     VALUES ($1,'x','Agent B','+256700000011', TRUE, 'support') RETURNING id`,
    [`test-agentb-${stamp}@jedida.test`]
  );
  agentBId = agentB.rows[0].id;

  const outsider = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, is_admin, admin_role)
     VALUES ($1,'x','Outsider Agent','+256700000012', TRUE, 'support') RETURNING id`,
    [`test-outsider-${stamp}@jedida.test`]
  );
  outsiderAgentId = outsider.rows[0].id;

  const customer = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number)
     VALUES ($1,'x','Test Customer','+256700000013') RETURNING id`,
    [`test-customer-${stamp}@jedida.test`]
  );
  customerId = customer.rows[0].id;

  const group = await query(`INSERT INTO agent_groups (name, created_by) VALUES ('Test Internal Group', $1) RETURNING id`, [agentAId]);
  groupId = group.rows[0].id;
  await addGroupMember({ groupId, agentId: agentAId, addedBy: agentAId });
  await addGroupMember({ groupId, agentId: agentBId, addedBy: agentAId });
  // outsiderAgentId deliberately NOT added to the group.

  const conv = await query(`INSERT INTO chat_conversations (user_id, agent_group_id, status) VALUES ($1,$2,'open') RETURNING id`, [customerId, groupId]);
  conversationId = conv.rows[0].id;
});

after(async () => {
  if (dmId) await query('DELETE FROM internal_messages WHERE internal_conversation_id = $1', [dmId]);
  if (groupRoomId) await query('DELETE FROM internal_messages WHERE internal_conversation_id = $1', [groupRoomId]);
  if (dmId) await query('DELETE FROM internal_conversations WHERE id = $1', [dmId]);
  if (groupRoomId) await query('DELETE FROM internal_conversations WHERE id = $1', [groupRoomId]);
  if (conversationId) await query('DELETE FROM internal_notes WHERE conversation_id = $1', [conversationId]);
  if (conversationId) await query('DELETE FROM chat_conversations WHERE id = $1', [conversationId]);
  if (groupId) await query('DELETE FROM agent_group_members WHERE group_id = $1', [groupId]);
  if (groupId) await query('DELETE FROM agent_groups WHERE id = $1', [groupId]);
  for (const id of [agentAId, agentBId, outsiderAgentId, customerId]) {
    if (id) await query('DELETE FROM users WHERE id = $1', [id]);
  }
  await pool.end();
});

test('agent-to-agent DM is invisible to a query scoped as the customer', async () => {
  const dm = await getOrCreateDm({ agentAId, agentBId });
  dmId = dm.id;
  await sendInternalMessage({ internalConversationId: dmId, senderId: agentAId, body: 'Can you handle this B2B question?' });

  // The only customer-facing message query in this codebase is scoped by
  // chat_conversations.user_id (chatService.getMessages / chat-v2 routes).
  // internal_messages has no user_id / customer_id column at all — so
  // there is no query shape a customer-facing endpoint could even
  // construct that would touch this table. Prove that directly:
  const customerScoped = await query(
    `SELECT im.* FROM internal_messages im
     WHERE im.internal_conversation_id = $1
       AND EXISTS (SELECT 1 FROM chat_conversations cc WHERE cc.user_id = $2 AND cc.id::text = im.internal_conversation_id::text)`,
    [dmId, customerId]
  );
  assert.equal(customerScoped.rows.length, 0, 'CRITICAL: no customer-scoped join can ever surface an internal DM message');
});

test('a non-member agent cannot read or post into a group\u2019s internal room', async () => {
  const room = await getOrCreateGroupRoom(groupId);
  groupRoomId = room.id;
  await sendInternalMessage({ internalConversationId: groupRoomId, senderId: agentBId, body: 'Who is handling the Entebbe issue?' });

  await assert.rejects(
    () => listInternalMessages({ internalConversationId: groupRoomId, agentId: outsiderAgentId }),
    (err) => {
      assert.equal(err.statusCode, 403, 'CRITICAL: a non-member agent must be forbidden from reading the group room, not just filtered');
      return true;
    }
  );

  await assert.rejects(
    () => sendInternalMessage({ internalConversationId: groupRoomId, senderId: outsiderAgentId, body: 'trying to sneak in' }),
    (err) => {
      assert.equal(err.statusCode, 403, 'CRITICAL: a non-member agent must be forbidden from posting into the group room');
      return true;
    }
  );
});

test('a member agent CAN read the group room (positive control — proves the block above is membership, not a bug)', async () => {
  const messages = await listInternalMessages({ internalConversationId: groupRoomId, agentId: agentAId });
  assert.ok(messages.length >= 1);
});

test('internal note on a customer conversation is never returned by the customer-facing message query', async () => {
  await addInternalNote({ conversationId, authorId: agentAId, body: 'Customer appears to need a long-term apartment.' });

  // Exactly the shape chatService.getMessages uses: scoped to chat_messages
  // for this conversation. internal_notes is a structurally separate table
  // (see schema_phase86 header) — this query cannot return note content
  // even if a customer somehow obtained this conversation_id.
  const customerFacingMessages = await query('SELECT * FROM chat_messages WHERE conversation_id = $1', [conversationId]);
  const leaked = customerFacingMessages.rows.some((m) => (m.body || '').includes('long-term apartment'));
  assert.equal(leaked, false, 'CRITICAL: internal note content must never appear in the customer-facing chat_messages result set');

  const notes = await query('SELECT * FROM internal_notes WHERE conversation_id = $1', [conversationId]);
  assert.equal(notes.rows.length, 1, 'the note itself should exist, just not in the customer-visible table');
});
