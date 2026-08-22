import { query, withTransaction } from '../config/db.js';
import { scanMessageText } from '../chat/contactModerationEngine.js';
import { sendWhatsappMessage, verifyWhatsappWebhookChallenge, parseWhatsappWebhookPayload } from '../services/whatsappService.js';
import { sendGenericEmail } from '../services/emailService.js';
import { translateText, isTranslationSupported } from '../chat/translate.js';

// A masked message is stored+delivered with contact info redacted, per
// scanMessageText's own severity model — a blocked message is still
// stored (never silently destroyed, per the "do not automatically
// destroy legitimate conversations" rule) but flagged for agent review
// and NOT auto-forwarded to the customer/business on the other end.
function moderateInbound(rawText) {
  const result = scanMessageText(rawText);
  const status = result.action === 'block' ? 'blocked' : result.action === 'mask' ? 'masked' : 'clean';
  return { status, storedBody: status === 'masked' ? result.maskedText : rawText, violations: result.violations };
}

async function findOrCreateThread(client, { channel, externalIdentifier, customerId, linkedContext }) {
  const existing = await client.query(
    `SELECT * FROM omnichannel_threads WHERE channel = $1 AND external_identifier = $2`,
    [channel, externalIdentifier]
  );
  if (existing.rows[0]) {
    // Backfill customer_id if we now know it and didn't before.
    if (!existing.rows[0].customer_id && customerId) {
      const updated = await client.query(
        `UPDATE omnichannel_threads SET customer_id = $2 WHERE id = $1 RETURNING *`,
        [existing.rows[0].id, customerId]
      );
      return updated.rows[0];
    }
    return existing.rows[0];
  }

  const inserted = await client.query(
    `INSERT INTO omnichannel_threads (customer_id, channel, external_identifier, linked_context)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [customerId || null, channel, externalIdentifier, JSON.stringify(linkedContext || {})]
  );
  return inserted.rows[0];
}

async function resolveCustomerByPhone(client, phoneE164) {
  // WhatsApp sends numbers without a leading '+'; match against both
  // forms since phone_number storage across the app is inconsistent
  // about the leading '+' (see phone_otp_codes usage elsewhere).
  const result = await client.query(
    `SELECT id FROM users WHERE phone_number = $1 OR phone_number = $2 LIMIT 1`,
    [phoneE164, `+${phoneE164}`]
  );
  return result.rows[0]?.id || null;
}

async function resolveCustomerByEmail(client, email) {
  const result = await client.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
  return result.rows[0]?.id || null;
}

async function touchThread(client, threadId, preview) {
  await client.query(
    `UPDATE omnichannel_threads SET last_message_at = now(), last_message_preview = $2, status = 'open' WHERE id = $1`,
    [threadId, preview.slice(0, 200)]
  );
}

async function notifyAgentsOfNewMessage(client, thread, flagged) {
  if (thread.assigned_agent_id) {
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        thread.assigned_agent_id,
        flagged ? 'omnichannel_message_flagged' : 'omnichannel_message_received',
        flagged ? 'Flagged message needs review' : 'New customer message',
        flagged ? 'A message was flagged by moderation and needs your review.' : 'A new message arrived in your inbox.',
        JSON.stringify({ threadId: thread.id })
      ]
    );
  }
}

// ------------------------------------------------------------
// WHATSAPP WEBHOOK
// ------------------------------------------------------------
export function whatsappWebhookVerify(req, res) {
  const challenge = verifyWhatsappWebhookChallenge(req.query);
  if (challenge) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

export async function whatsappWebhookReceive(req, res) {
  // Always 200 quickly — Meta retries aggressively on non-2xx, which
  // would otherwise duplicate-insert every retried message even with
  // the dedupe constraint doing its job.
  res.sendStatus(200);

  const parsedMessages = parseWhatsappWebhookPayload(req.body);
  for (const msg of parsedMessages) {
    try {
      await withTransaction(async (client) => {
        const customerId = await resolveCustomerByPhone(client, msg.from);
        const thread = await findOrCreateThread(client, {
          channel: 'whatsapp', externalIdentifier: msg.from, customerId, linkedContext: {}
        });

        const moderation = moderateInbound(msg.body);

        const inserted = await client.query(
          `INSERT INTO omnichannel_messages
             (thread_id, channel, direction, body, original_body, moderation_status, moderation_violations, external_message_id)
           VALUES ($1,'whatsapp','inbound',$2,$3,$4,$5,$6)
           ON CONFLICT (channel, external_message_id) DO NOTHING
           RETURNING *`,
          [thread.id, moderation.storedBody, msg.body, moderation.status, JSON.stringify(moderation.violations), msg.waMessageId]
        );
        if (!inserted.rows[0]) return; // duplicate webhook delivery

        await touchThread(client, thread.id, moderation.storedBody);
        await notifyAgentsOfNewMessage(client, thread, moderation.status === 'blocked');
      });
    } catch (err) {
      console.error('WhatsApp webhook processing error:', err);
    }
  }
}

// ------------------------------------------------------------
// EMAIL INBOUND WEBHOOK — generic shape (from, to, subject, text,
// messageId, inReplyTo) matching what most inbound-email providers
// (Postmark, SendGrid Inbound Parse, Mailgun) POST after their own
// provider-specific parsing. Swap the field-mapping at the top of this
// function if your provider's payload differs — the rest is provider-
// agnostic.
// ------------------------------------------------------------
export async function emailWebhookReceive(req, res) {
  res.sendStatus(200);

  const { from, subject, text, messageId } = req.body || {};
  if (!from || !messageId) return;

  try {
    await withTransaction(async (client) => {
      const customerId = await resolveCustomerByEmail(client, from);
      const thread = await findOrCreateThread(client, {
        channel: 'email', externalIdentifier: from.toLowerCase(), customerId, linkedContext: {}
      });

      const moderation = moderateInbound(text || '');

      const inserted = await client.query(
        `INSERT INTO omnichannel_messages
           (thread_id, channel, direction, body, original_body, channel_metadata, moderation_status, moderation_violations, external_message_id)
         VALUES ($1,'email','inbound',$2,$3,$4,$5,$6,$7)
         ON CONFLICT (channel, external_message_id) DO NOTHING
         RETURNING *`,
        [thread.id, moderation.storedBody, text || '', JSON.stringify({ subject }), moderation.status, JSON.stringify(moderation.violations), messageId]
      );
      if (!inserted.rows[0]) return;

      await touchThread(client, thread.id, moderation.storedBody);
      await notifyAgentsOfNewMessage(client, thread, moderation.status === 'blocked');
    });
  } catch (err) {
    console.error('Email webhook processing error:', err);
  }
}

// ------------------------------------------------------------
// AGENT INBOX
// ------------------------------------------------------------
export async function listThreads(req, res) {
  try {
    const result = await query(
      `SELECT t.*, u.full_name AS customer_name, u.email AS customer_email
       FROM omnichannel_threads t
       LEFT JOIN users u ON u.id = t.customer_id
       WHERE t.status != 'resolved' OR t.updated_at > now() - INTERVAL '7 days'
       ORDER BY t.last_message_at DESC
       LIMIT 200`
    );
    return res.json({ threads: result.rows });
  } catch (err) {
    console.error('List omnichannel threads error:', err);
    return res.status(500).json({ error: 'Could not load threads.' });
  }
}

// Unified timeline: merges this thread's WhatsApp/email messages with
// the customer's existing in-platform Jedida chat, sorted by time — the
// "single unified customer communication timeline" requirement,
// achieved without touching the working chat_messages write path.
//
// Optional ?lang=xx translates every message body for display (e.g. an
// agent handling a Chinese supplier's WhatsApp thread views it in
// English) via the shared translation service layer — translateText()
// never throws, so a translation-service outage degrades to showing
// the original text rather than breaking the inbox.
export async function getThreadTimeline(req, res) {
  try {
    const threadResult = await query('SELECT * FROM omnichannel_threads WHERE id = $1', [req.params.id]);
    const thread = threadResult.rows[0];
    if (!thread) return res.status(404).json({ error: 'Thread not found.' });

    const omnichannelMessages = await query(
      `SELECT id, channel, direction, body, channel_metadata, moderation_status, external_message_id, created_at
       FROM omnichannel_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
      [thread.id]
    );

    let chatMessages = { rows: [] };
    if (thread.customer_id) {
      chatMessages = await query(
        `SELECT id, user_id, sender_id, body, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC`,
        [thread.customer_id]
      );
    }

    let merged = [
      ...omnichannelMessages.rows.map((m) => ({
        id: m.id, channel: m.channel, direction: m.direction, body: m.body,
        moderationStatus: m.moderation_status, createdAt: m.created_at
      })),
      ...chatMessages.rows.map((m) => ({
        id: m.id, channel: 'jedida_chat',
        direction: m.sender_id === m.user_id ? 'inbound' : 'outbound',
        body: m.body, moderationStatus: 'clean', createdAt: m.created_at
      }))
    ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const targetLang = req.query.lang;
    if (targetLang && isTranslationSupported(targetLang)) {
      merged = await Promise.all(merged.map(async (m) => {
        const result = await translateText(m.body, targetLang);
        return { ...m, translatedBody: result.translated ? result.text : null };
      }));
    }

    return res.json({ thread, messages: merged });
  } catch (err) {
    console.error('Get thread timeline error:', err);
    return res.status(500).json({ error: 'Could not load this conversation.' });
  }
}

export async function assignThread(req, res) {
  const { agentId } = req.body;
  try {
    const result = await query(
      `UPDATE omnichannel_threads SET assigned_agent_id = $2 WHERE id = $1 RETURNING *`,
      [req.params.id, agentId || req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Thread not found.' });
    return res.json({ thread: result.rows[0] });
  } catch (err) {
    console.error('Assign thread error:', err);
    return res.status(500).json({ error: 'Could not assign this thread.' });
  }
}

export async function resolveThread(req, res) {
  try {
    const result = await query(
      `UPDATE omnichannel_threads SET status = 'resolved' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Thread not found.' });
    return res.json({ thread: result.rows[0] });
  } catch (err) {
    console.error('Resolve thread error:', err);
    return res.status(500).json({ error: 'Could not resolve this thread.' });
  }
}

// Agent sends an outbound reply on whichever channel the thread is on.
// Outbound messages are NOT moderation-scanned — they're staff-composed,
// same exemption logic as isExemptSender() for admins in the in-platform
// chat moderation engine.
//
// If the customer has a preferred_language set and it differs from what
// the agent typed in, the delivered text is translated via the shared
// translation service layer — the agent's original wording is still
// what's stored as the message body (so the timeline always shows what
// was actually written), with the translated version recorded
// separately in channel_metadata for reference.
export async function sendThreadReply(req, res) {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required.' });

  try {
    const threadResult = await query('SELECT * FROM omnichannel_threads WHERE id = $1', [req.params.id]);
    const thread = threadResult.rows[0];
    if (!thread) return res.status(404).json({ error: 'Thread not found.' });

    let outgoingBody = body;
    let translatedFrom = null;
    if (thread.customer_id) {
      const customerResult = await query('SELECT preferred_language FROM users WHERE id = $1', [thread.customer_id]);
      const preferredLang = customerResult.rows[0]?.preferred_language;
      if (preferredLang && preferredLang !== 'en' && isTranslationSupported(preferredLang)) {
        const translation = await translateText(body, preferredLang);
        if (translation.translated) {
          outgoingBody = translation.text;
          translatedFrom = 'en';
        }
      }
    }

    let deliveryResult;
    let externalMessageId = null;
    let channelMetadata = {};

    if (thread.channel === 'whatsapp') {
      deliveryResult = await sendWhatsappMessage(thread.external_identifier, outgoingBody);
      externalMessageId = deliveryResult.waMessageId || null;
    } else {
      const subject = thread.linked_context?.subject || 'Message from Jedida support';
      deliveryResult = await sendGenericEmail(thread.external_identifier, subject, outgoingBody);
      externalMessageId = deliveryResult.messageId || null;
      channelMetadata = { subject };
    }

    if (translatedFrom) {
      channelMetadata = { ...channelMetadata, translatedBody: outgoingBody, translatedFrom };
    }

    const inserted = await query(
      `INSERT INTO omnichannel_messages
         (thread_id, channel, direction, sent_by_agent_id, body, channel_metadata, moderation_status, external_message_id)
       VALUES ($1,$2,'outbound',$3,$4,$5,'clean',$6) RETURNING *`,
      [thread.id, thread.channel, req.user.id, body, JSON.stringify(channelMetadata), externalMessageId]
    );

    await query(
      `UPDATE omnichannel_threads SET last_message_at = now(), last_message_preview = $2 WHERE id = $1`,
      [thread.id, body.slice(0, 200)]
    );

    if (!deliveryResult.sent) {
      return res.status(502).json({ message: 'Saved, but delivery to the customer failed — check channel configuration.', message_record: inserted.rows[0] });
    }

    return res.status(201).json({ message: 'Sent.', message_record: inserted.rows[0], sandbox: Boolean(deliveryResult.sandbox), translated: Boolean(translatedFrom) });
  } catch (err) {
    console.error('Send thread reply error:', err);
    return res.status(500).json({ error: 'Could not send this reply.' });
  }
}
