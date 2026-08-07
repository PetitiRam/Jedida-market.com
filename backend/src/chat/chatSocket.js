import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { query } from '../config/db.js';
import {
  saveMessage,
  getConversationById,
  markMessagesRead,
  reactToMessage,
  editMessage,
  deleteMessageForEveryone,
  getBridgeById,
  getUserLanguage,
  cacheMessageTranslation,
  setMessagePinned,
  isBlockedEitherWay,
  forwardMessage
} from './chatService.js';
import { translateText } from './translate.js';
import { scanMessageText, isExemptSender, recordModerationEvent, buildReminderMessage } from './contactModerationEngine.js';
import { processIncomingMessage, SYSTEM_AI_USER_ID } from './aiAssistant.js';
import { sendPushToUser } from '../services/pushService.js';

// Push a chat message to a recipient's phone only when they're not actively
// connected to any device's socket right now (mirrors what "online" already
// means for presence dots) — no point double-notifying someone already
// looking at the conversation. Never throws — see sendPushToUser.
async function notifyOfflineRecipient({ recipientId, senderId, isAdminSender, conversationId, previewText, messageType }) {
  if (!recipientId || isUserOnline(recipientId)) return;
  let senderName = 'JEDIDA Support';
  if (!isAdminSender) {
    const senderResult = await query('SELECT full_name FROM users WHERE id = $1', [senderId]);
    senderName = senderResult.rows[0]?.full_name || 'New message';
  }
  const preview = messageType === 'text'
    ? (previewText || '').slice(0, 120)
    : messageType === 'image' ? '📷 Photo'
    : messageType === 'video' ? '🎥 Video'
    : messageType === 'audio' ? '🎤 Voice message'
    : messageType === 'document' ? '📎 Document'
    : messageType === 'product' ? '🛍️ Shared a product'
    : messageType === 'order' ? '📦 Order update'
    : 'New message';
  await sendPushToUser(recipientId, {
    title: senderName || 'JEDIDA Marketplace',
    body: preview,
    data: { type: 'chat', conversationId }
  });
}

// Runs the contact/fraud moderation engine against an outgoing message body,
// unless the sender is a verified admin/official support account. Returns
// { finalBody, moderationStatus, originalBody, scanResult } — finalBody is
// what actually gets saved/broadcast (masked text, or '' if fully blocked).
function moderateOutgoing(body, user) {
  if (isExemptSender(user)) {
    return { finalBody: body, moderationStatus: 'clean', originalBody: null, scanResult: null };
  }
  const scanResult = scanMessageText(body);
  if (scanResult.action === 'allow') {
    return { finalBody: body, moderationStatus: 'clean', originalBody: null, scanResult };
  }
  if (scanResult.action === 'block') {
    return { finalBody: '', moderationStatus: 'blocked', originalBody: body, scanResult };
  }
  return { finalBody: scanResult.maskedText, moderationStatus: 'masked', originalBody: body, scanResult };
}

let io;

// userId -> Set of connected socket ids (a user can have multiple tabs/devices open)
const onlineUsers = new Map();

function addOnlineSocket(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}

function removeOnlineSocket(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
}

// A user may only send/read in a conversation that's actually theirs
// (or theirs to moderate, if they're an admin).
async function assertParticipant(conversationId, user) {
  const conversation = await getConversationById(conversationId);
  if (!conversation) throw new Error('Conversation not found');
  if (user.isAdmin) return conversation;
  if (conversation.user_id !== user.id && conversation.seller_id !== user.id) {
    throw new Error('Not a participant in this conversation');
  }
  return conversation;
}

// Translates a just-sent message into whichever language the *other*
// participant reads chat in, and caches the result on the message row so we
// don't re-call the translation API on every reload. Never throws — a
// translation hiccup should never block message delivery.
async function translateForRecipient(conversation, senderId, message) {
  const recipientId = conversation.user_id === senderId ? conversation.seller_id : conversation.user_id;
  if (!recipientId) return message;

  try {
    const recipientLang = await getUserLanguage(recipientId);
    if (recipientLang === 'en' && !message.body) return message; // nothing to do
    const result = await translateText(message.body, recipientLang);
    if (!result.translated) return { ...message, translation_note: result.reason || null };

    const updated = await cacheMessageTranslation({ messageId: message.id, langKey: recipientLang, text: result.text });
    return updated || message;
  } catch (err) {
    console.error('translateForRecipient error:', err.message);
    return message;
  }
}

export function initChatSocket(httpServer, frontendUrl) {
  io = new Server(httpServer, {
    cors: {
      origin: frontendUrl || '*',
      methods: ['GET', 'POST']
    }
  });

  // Every socket connection must present the same JWT used for REST calls.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(token);
      socket.user = { id: payload.sub, role: payload.role, isAdmin: payload.isAdmin };
      next();
    } catch {
      next(new Error('Invalid or expired session'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    console.log('🟢 Chat connected:', socket.id, user.id);

    addOnlineSocket(user.id, socket.id);
    io.emit('presence:update', { userId: user.id, isOnline: true });

    if (user.isAdmin) {
      socket.join('admin:escalations');
    }

    socket.on('conversation:join', async ({ conversationId }, callback) => {
      try {
        await assertParticipant(conversationId, user);
        socket.join(`conversation:${conversationId}`);
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('conversation:leave', ({ conversationId }) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Live delivery tracking — reuses this same authenticated socket
    // connection rather than standing up a second server.
    socket.on('delivery:join', async ({ deliveryId }, callback) => {
      try {
        if (!user.isAdmin) {
          const result = await query(
            `
            SELECT 1 FROM deliveries d
            JOIN orders o ON o.id = d.order_id
            LEFT JOIN drivers dr ON dr.id = d.driver_id
            WHERE d.id = $1 AND (o.buyer_id = $2 OR dr.user_id = $2)
            `,
            [deliveryId, user.id]
          );
          if (result.rows.length === 0) throw new Error('Not authorized to track this delivery');
        }
        socket.join(`delivery:${deliveryId}`);
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on('delivery:leave', ({ deliveryId }) => {
      socket.leave(`delivery:${deliveryId}`);
    });

    socket.on('message:send', async ({ conversationId, body, replyToId, messageType, attachmentUrl, attachmentMeta }, callback) => {
      try {
        const caption = body || '';
        if (!attachmentUrl && !caption.trim()) throw new Error('Message cannot be empty');
        const conversation = await assertParticipant(conversationId, user);

        const otherUserId = conversation.user_id === user.id ? conversation.seller_id : conversation.user_id;
        if (await isBlockedEitherWay(user.id, otherUserId)) {
          throw new Error('You can no longer message this user.');
        }

        const ATTACHMENT_TYPES = ['image', 'video', 'audio', 'document'];
        // 'product' / 'order' are structured cards (carry productId/orderId +
        // a snapshot in attachmentMeta) posted by the AI Assistant quick
        // actions or a "share product" action — not free-form uploads, so
        // they're validated separately: only allowed through with a body
        // (used as the fallback/plain-text rendering) and a non-empty meta.
        const STRUCTURED_TYPES = ['product', 'order'];
        const resolvedType = ATTACHMENT_TYPES.includes(messageType)
          ? messageType
          : messageType === 'sticker' ? 'sticker'
          : (STRUCTURED_TYPES.includes(messageType) && attachmentMeta && Object.keys(attachmentMeta).length) ? messageType
          : 'text';

        // Attachments themselves aren't scanned (that needs image/audio
        // moderation, out of scope here) — only the caption text is.
        const { finalBody, moderationStatus, originalBody, scanResult } = moderateOutgoing(caption, user);

        if (moderationStatus === 'blocked') {
          const blockedMsg = await saveMessage({
            conversationId, userId: user.id, senderId: user.id,
            body: '[message blocked by Petiti AI — contact-sharing attempt]',
            replyToId: replyToId || null, messageType: 'text',
            moderationStatus, originalBody, isOfficial: false
          });
          await recordModerationEvent({ conversationId, messageId: blockedMsg.id, userId: user.id, result: scanResult });
          callback?.({ error: buildReminderMessage(scanResult), moderation: { status: 'blocked' } });
          return;
        }

        let message = await saveMessage({
          conversationId,
          userId: user.id,
          senderId: user.id,
          body: finalBody,
          replyToId: replyToId || null,
          messageType: resolvedType,
          moderationStatus,
          originalBody,
          isOfficial: Boolean(user.isAdmin),
          attachmentUrl: attachmentUrl || null,
          attachmentMeta: attachmentMeta || {}
        });

        if (moderationStatus === 'masked') {
          await recordModerationEvent({ conversationId, messageId: message.id, userId: user.id, result: scanResult });
        }

        message = message.message_type === 'text' ? await translateForRecipient(conversation, user.id, message) : message;

        io.to(`conversation:${conversationId}`).emit('message:new', message);

        if (moderationStatus !== 'blocked') {
          notifyOfflineRecipient({
            recipientId: otherUserId,
            senderId: user.id,
            isAdminSender: Boolean(user.isAdmin),
            conversationId,
            previewText: message.body,
            messageType: message.message_type
          }).catch((err) => console.error('notifyOfflineRecipient error (non-fatal):', err.message));
        }

        if (moderationStatus === 'masked') {
          // Only the sender sees the reminder — the recipient just sees the
          // masked message like any other.
          socket.emit('moderation:warning', { conversationId, messageId: message.id, reminder: buildReminderMessage(scanResult) });
        }

        // AI assistant turn — only for plain text messages, never for the
        // AI's own account, and only when the conversation hasn't already
        // been handed to a human. Wrapped so a failure here (e.g. Claude
        // API outage) never blocks the user's message from being delivered.
        if (resolvedType === 'text' && !user.isAdmin) {
          try {
            const { escalation, replyText } = await processIncomingMessage({ conversation, user, text: caption });
            if (replyText) {
              const aiMessage = await saveMessage({
                conversationId,
                userId: conversation.user_id,
                senderId: SYSTEM_AI_USER_ID,
                body: replyText,
                messageType: 'text',
                isAi: true
              });
              io.to(`conversation:${conversationId}`).emit('message:new', aiMessage);
            }
            if (escalation) {
              io.to('admin:escalations').emit('escalation:new', {
                conversationId, area: escalation.area, reason: escalation.reason, userId: user.id
              });
            }
          } catch (err) {
            console.error('AI assistant turn failed (non-fatal):', err.message);
          }
        }

        callback?.({ success: true, message, moderation: { status: moderationStatus } });
      } catch (error) {
        console.error('message:send error', error);
        callback?.({ error: error.message || 'Unable to send message' });
      }
    });

    // Relays a message across a buyer<->seller bridge an admin has set up,
    // fanning it out to both sides of the bridge.
    socket.on('message:send-bridged', async ({ linkId, senderConversationId, body }, callback) => {
      try {
        if (!body || !body.trim()) throw new Error('Message cannot be empty');
        const bridge = await getBridgeById(linkId);
        if (!bridge) throw new Error('Bridge not found');

        const isBuyerSide = bridge.buyer_conversation_id === senderConversationId;
        const isSellerSide = bridge.seller_conversation_id === senderConversationId;
        if (!isBuyerSide && !isSellerSide) throw new Error('Not part of this bridge');

        const otherConversationId = isBuyerSide ? bridge.seller_conversation_id : bridge.buyer_conversation_id;

        const { finalBody, moderationStatus, originalBody, scanResult } = moderateOutgoing(body, user);

        if (moderationStatus === 'blocked') {
          const blockedMsg = await saveMessage({
            conversationId: senderConversationId, userId: user.id, senderId: user.id,
            body: '[message blocked by Petiti AI — contact-sharing attempt]',
            messageType: 'bridged', moderationStatus, originalBody
          });
          await recordModerationEvent({ conversationId: senderConversationId, messageId: blockedMsg.id, userId: user.id, result: scanResult });
          callback?.({ error: buildReminderMessage(scanResult), moderation: { status: 'blocked' } });
          return;
        }

        const message = await saveMessage({
          conversationId: senderConversationId,
          userId: user.id,
          senderId: user.id,
          body: finalBody,
          messageType: 'bridged',
          moderationStatus,
          originalBody,
          isOfficial: Boolean(user.isAdmin)
        });

        if (moderationStatus === 'masked') {
          await recordModerationEvent({ conversationId: senderConversationId, messageId: message.id, userId: user.id, result: scanResult });
        }

        const otherConversation = await getConversationById(otherConversationId);
        const translatedForOther = otherConversation
          ? await translateForRecipient(otherConversation, user.id, message)
          : message;

        io.to(`conversation:${senderConversationId}`).emit('message:new', message);
        io.to(`conversation:${otherConversationId}`).emit('message:new', translatedForOther);

        if (moderationStatus === 'masked') {
          socket.emit('moderation:warning', { conversationId: senderConversationId, messageId: message.id, reminder: buildReminderMessage(scanResult) });
        }

        callback?.({ success: true, message, moderation: { status: moderationStatus } });
      } catch (error) {
        console.error('message:send-bridged error', error);
        callback?.({ error: error.message || 'Unable to send message' });
      }
    });

    socket.on('message:mark-read', async ({ conversationId }) => {
      try {
        await assertParticipant(conversationId, user);
        const messageIds = await markMessagesRead({ conversationId, readerId: user.id });
        if (messageIds.length) {
          io.to(`conversation:${conversationId}`).emit('message:read', { messageIds });
        }
      } catch (error) {
        console.error('message:mark-read error', error);
      }
    });

    socket.on('message:react', async ({ messageId, conversationId, emoji }) => {
      try {
        await assertParticipant(conversationId, user);
        const message = await reactToMessage({ messageId, userId: user.id, emoji });
        if (message) io.to(`conversation:${conversationId}`).emit('message:edited', message);
      } catch (error) {
        console.error('message:react error', error);
      }
    });

    socket.on('message:edit', async ({ messageId, conversationId, newBody }, callback) => {
      try {
        if (!newBody || !newBody.trim()) throw new Error('Message cannot be empty');
        const message = await editMessage({ messageId, senderId: user.id, newBody });
        if (!message) throw new Error('Message not found or not yours to edit');
        io.to(`conversation:${conversationId}`).emit('message:edited', message);
        callback?.({ success: true, message });
      } catch (error) {
        callback?.({ error: error.message || 'Unable to edit message' });
      }
    });

    socket.on('message:delete-for-everyone', async ({ messageId, conversationId }) => {
      try {
        const message = await deleteMessageForEveryone({ messageId, senderId: user.id });
        if (message) io.to(`conversation:${conversationId}`).emit('message:deleted', { messageId });
      } catch (error) {
        console.error('message:delete-for-everyone error', error);
      }
    });

    socket.on('message:pin', async ({ messageId, conversationId }) => {
      try {
        await assertParticipant(conversationId, user);
        const message = await setMessagePinned({ messageId, conversationId, pinned: true });
        if (message) io.to(`conversation:${conversationId}`).emit('message:pinned', message);
      } catch (error) {
        console.error('message:pin error', error);
      }
    });

    socket.on('message:unpin', async ({ messageId, conversationId }) => {
      try {
        await assertParticipant(conversationId, user);
        const message = await setMessagePinned({ messageId, conversationId, pinned: false });
        if (message) io.to(`conversation:${conversationId}`).emit('message:unpinned', message);
      } catch (error) {
        console.error('message:unpin error', error);
      }
    });

    socket.on('message:forward', async ({ messageId, targetConversationId }, callback) => {
      try {
        await assertParticipant(targetConversationId, user);
        const otherUserId = (await getConversationById(targetConversationId))?.seller_id;
        if (otherUserId && await isBlockedEitherWay(user.id, otherUserId)) {
          throw new Error('You can no longer message this user.');
        }
        const message = await forwardMessage({ sourceMessageId: messageId, targetConversationId, userId: user.id });
        io.to(`conversation:${targetConversationId}`).emit('message:new', message);
        callback?.({ success: true, message });
      } catch (error) {
        callback?.({ error: error.message || 'Unable to forward message' });
      }
    });

    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:update', { userId: user.id, isTyping: true });
    });

    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('typing:update', { userId: user.id, isTyping: false });
    });

    socket.on('disconnect', () => {
      console.log('🔴 Chat disconnected:', socket.id, user.id);
      removeOnlineSocket(user.id, socket.id);
      if (!onlineUsers.has(user.id)) {
        io.emit('presence:update', { userId: user.id, isOnline: false, lastSeenAt: new Date().toISOString() });
      }
    });
  });

  return io;
}

export function getIO() {
  return io;
}

export function isUserOnline(userId) {
  return onlineUsers.has(userId);
}
