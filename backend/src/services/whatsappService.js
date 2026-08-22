// WhatsApp Business Cloud API integration. Uses the official Meta Cloud
// API (graph.facebook.com) — the only supported way to automate
// WhatsApp per the master brief ("do not automate personal WhatsApp
// accounts in an unsafe or unsupported manner"). All credentials come
// from environment variables; nothing here fabricates undocumented
// endpoint behavior — this follows Meta's public Cloud API shape:
// POST https://graph.facebook.com/v20.0/{phone-number-id}/messages
//
// Required env vars:
//   WHATSAPP_ACCESS_TOKEN         — permanent or long-lived system-user token
//   WHATSAPP_PHONE_NUMBER_ID      — the Cloud API phone number ID
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN — arbitrary string you also set in the
//                                   Meta App dashboard's webhook config

const GRAPH_API_VERSION = 'v20.0';

export function isWhatsappConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsappMessage(toE164, body) {
  if (!isWhatsappConfigured()) {
    console.log(`[JEDIDA][SANDBOX WHATSAPP] to ${toE164}: ${body}`);
    return { sent: true, sandbox: true };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toE164,
        type: 'text',
        text: { body }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('WhatsApp send error:', data);
      return { sent: false, sandbox: false, error: data?.error?.message || 'WhatsApp API error' };
    }
    return { sent: true, sandbox: false, waMessageId: data?.messages?.[0]?.id || null };
  } catch (err) {
    console.error('WhatsApp send exception:', err.message);
    return { sent: false, sandbox: false, error: err.message };
  }
}

// Verifies Meta's webhook subscription handshake:
// GET .../webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
// Returns the challenge string to echo back on success, or null on
// mismatch (caller should respond 403).
export function verifyWhatsappWebhookChallenge(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

// Parses an inbound Cloud API webhook payload into a flat list of
// { from, waMessageId, body, timestamp, type } — Meta batches multiple
// messages/statuses per webhook call, and every field it sends can be
// legitimately absent (e.g. status-only callbacks with no messages),
// so this defensively walks the documented entry/changes/value shape
// and returns an empty array rather than throwing on anything
// unexpected.
export function parseWhatsappWebhookPayload(payload) {
  const messages = [];
  try {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        for (const msg of value?.messages || []) {
          if (msg.type !== 'text') continue; // media/interactive handled in a future phase
          messages.push({
            from: msg.from,
            waMessageId: msg.id,
            body: msg.text?.body || '',
            timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date()
          });
        }
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook parse error:', err.message);
  }
  return messages;
}
