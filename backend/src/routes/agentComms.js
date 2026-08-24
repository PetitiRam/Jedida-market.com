import express from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import * as svc from '../chat/agentCommsService.js';
import { getIO } from '../chat/chatSocket.js';

const router = express.Router();

// Every route here is an agent-facing route — gated the same way the
// rest of admin chat functionality already is (ADMIN_ROLE_PERMISSIONS
// 'chat' area covers support/chat_assistant/business_rep/security_agent,
// plus super admins). Nothing here is reachable by a plain customer
// account, and the service layer re-derives access from req.user.id
// rather than trusting anything the client sends about who it is.
router.use(requireAuth, requirePermission('chat'));

function handle(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result);
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, code: err.code });
      console.error('AGENT COMMS ERROR:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

// ---------------------------------------------------------------------------
// Sectors & Groups
// ---------------------------------------------------------------------------

router.get('/sectors', handle(async () => ({ sectors: await svc.listSectors() })));

router.post('/sectors', handle(async (req) => ({
  sector: await svc.createSector({ ...req.body, createdBy: req.user.id })
})));

router.get('/groups', handle(async (req) => ({
  groups: await svc.listGroups({ sectorId: req.query.sectorId || null })
})));

router.post('/groups', handle(async (req) => ({
  group: await svc.createGroup({ ...req.body, createdBy: req.user.id })
})));

router.patch('/groups/:groupId', handle(async (req) => ({
  group: await svc.updateGroup(req.params.groupId, req.body)
})));

router.post('/groups/:groupId/members', handle(async (req) => ({
  member: await svc.addGroupMember({ groupId: req.params.groupId, ...req.body, addedBy: req.user.id })
})));

router.delete('/groups/:groupId/members/:agentId', handle(async (req) => {
  await svc.removeGroupMember({ groupId: req.params.groupId, agentId: req.params.agentId });
  return { success: true };
}));

router.get('/groups/mine', handle(async (req) => ({
  groups: await svc.listAgentGroupsFor(req.user.id)
})));

// ---------------------------------------------------------------------------
// Agent directory & presence
// ---------------------------------------------------------------------------

router.get('/agents', handle(async (req) => ({
  agents: await svc.listAgents({ groupId: req.query.groupId || null, search: req.query.search || null })
})));

router.patch('/me/presence', handle(async (req) => {
  const profile = await svc.setPresence({ agentId: req.user.id, presence: req.body.presence });
  const io = getIO();
  if (io) io.emit('agent-presence:update', { agentId: req.user.id, presence: profile.presence });
  return { profile };
}));

// ---------------------------------------------------------------------------
// Inbox / conversations
// ---------------------------------------------------------------------------

router.get('/inbox', handle(async (req) => {
  const { status, groupId, sectorId, priority, unassigned, assignedToMe, search, limit, offset } = req.query;
  const conversations = await svc.listInbox({
    status: status || null,
    groupId: groupId || null,
    sectorId: sectorId || null,
    priority: priority || null,
    assignedAgentId: assignedToMe === 'true' ? req.user.id : null,
    unassignedOnly: unassigned === 'true',
    search: search || null,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0
  });
  return { conversations };
}));

router.get('/inbox/summary', handle(async () => ({ summary: await svc.getInboxSummary() })));

router.get('/conversations/:conversationId', handle(async (req) => {
  const conversation = await svc.getConversationDetail(req.params.conversationId);
  return { conversation };
}));

router.post('/conversations/:conversationId/claim', handle(async (req) => {
  const conversation = await svc.claimConversation({ conversationId: req.params.conversationId, agentId: req.user.id });
  const io = getIO();
  if (io) io.to(`conversation:${conversation.id}`).emit('conversation:assigned', conversation);
  return { conversation };
}));

router.post('/conversations/:conversationId/assign', handle(async (req) => {
  const conversation = await svc.assignConversation({
    conversationId: req.params.conversationId,
    agentId: req.body.agentId,
    assignedBy: req.user.id
  });
  const io = getIO();
  if (io) io.to(`conversation:${conversation.id}`).emit('conversation:assigned', conversation);
  return { conversation };
}));

router.post('/conversations/:conversationId/priority', handle(async (req) => ({
  conversation: await svc.setPriority({ conversationId: req.params.conversationId, priority: req.body.priority, setBy: req.user.id })
})));

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

router.post('/conversations/:conversationId/transfer', handle(async (req) => {
  const { toAgentId, toGroupId, transferType, reason, note } = req.body;
  const result = await svc.transferConversation({
    conversationId: req.params.conversationId,
    toAgentId: toAgentId || null,
    toGroupId: toGroupId || null,
    transferType: transferType || 'agent',
    reason,
    note,
    initiatedBy: req.user.id
  });
  const io = getIO();
  if (io) io.to(`conversation:${result.conversation.id}`).emit('conversation:transferred', result);
  return result;
}));

router.get('/conversations/:conversationId/transfers', handle(async (req) => ({
  transfers: await svc.getTransferHistory(req.params.conversationId)
})));

// ---------------------------------------------------------------------------
// Internal notes
// ---------------------------------------------------------------------------

router.get('/conversations/:conversationId/notes', handle(async (req) => ({
  notes: await svc.listInternalNotes(req.params.conversationId)
})));

router.post('/conversations/:conversationId/notes', handle(async (req) => ({
  note: await svc.addInternalNote({ conversationId: req.params.conversationId, authorId: req.user.id, body: req.body.body })
})));

// ---------------------------------------------------------------------------
// Internal chat (agent <-> agent, agent <-> group)
// ---------------------------------------------------------------------------

router.get('/internal/conversations', handle(async (req) => ({
  conversations: await svc.listMyInternalConversations(req.user.id)
})));

router.post('/internal/dm/:agentId', handle(async (req) => ({
  conversation: await svc.getOrCreateDm({ agentAId: req.user.id, agentBId: req.params.agentId })
})));

router.post('/internal/group/:groupId', handle(async (req) => ({
  conversation: await svc.getOrCreateGroupRoom(req.params.groupId)
})));

router.get('/internal/conversations/:internalConversationId/messages', handle(async (req) => ({
  messages: await svc.listInternalMessages({
    internalConversationId: req.params.internalConversationId,
    agentId: req.user.id,
    before: req.query.before || null,
    limit: req.query.limit ? Number(req.query.limit) : 50
  })
})));

router.post('/internal/conversations/:internalConversationId/messages', handle(async (req) => {
  const message = await svc.sendInternalMessage({
    internalConversationId: req.params.internalConversationId,
    senderId: req.user.id,
    body: req.body.body,
    attachmentUrl: req.body.attachmentUrl || null,
    attachmentMeta: req.body.attachmentMeta || {},
    mentionedAgentIds: req.body.mentionedAgentIds || []
  });
  const io = getIO();
  if (io) io.to(`internal:${req.params.internalConversationId}`).emit('internal-message:new', message);
  return { message };
}));

router.post('/internal/conversations/:internalConversationId/read', handle(async (req) => {
  await svc.markInternalRead({ internalConversationId: req.params.internalConversationId, agentId: req.user.id });
  return { success: true };
}));

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

router.get('/mentions', handle(async (req) => ({
  mentions: await svc.listMyMentions({ agentId: req.user.id, unreadOnly: req.query.unread === 'true' })
})));

router.post('/mentions/:mentionId/read', handle(async (req) => ({
  mention: await svc.markMentionRead({ mentionId: req.params.mentionId, agentId: req.user.id })
})));

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------

router.post('/broadcasts', handle(async (req) => {
  const { audienceType, audienceGroupId, audienceSectorId, customerIds, message, attachmentUrl } = req.body;
  return svc.sendBroadcast({
    senderId: req.user.id,
    audienceType,
    audienceGroupId: audienceGroupId || null,
    audienceSectorId: audienceSectorId || null,
    customerIds: customerIds || [],
    messageBody: message,
    attachmentUrl: attachmentUrl || null
  });
}));

router.get('/broadcasts', handle(async (req) => ({
  broadcasts: await svc.listBroadcasts(req.user.id)
})));

router.get('/broadcasts/:broadcastId', handle(async (req) => svc.getBroadcastStatus(req.params.broadcastId)));

export default router;
