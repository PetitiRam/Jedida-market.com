// Signature verification for each payment provider's webhook scheme.
// Every function here takes the RAW request body — these HMACs are
// computed over the exact bytes the provider sent, so verification must
// happen before any JSON.parse/re-serialization. See routes/paymentWebhooks.js,
// which mounts these routes with express.raw() ahead of the app-wide
// express.json() in server.js specifically so the raw Buffer survives.

import crypto from 'crypto';

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Stripe: header is "t=<timestamp>,v1=<hex hmac>[,v0=...]". Signed
// payload is "<timestamp>.<raw body>", HMAC-SHA256 with the webhook
// signing secret. Also enforces a 5-minute tolerance window against
// replay of a captured (but validly-signed) webhook payload.
export function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return { valid: false, reason: 'Missing signature or secret.' };
  const parts = Object.fromEntries(sigHeader.split(',').map((kv) => kv.split('=')));
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return { valid: false, reason: 'Malformed signature header.' };

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (ageSeconds > 300) return { valid: false, reason: 'Signature timestamp outside tolerance (possible replay).' };

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  if (!timingSafeEqualHex(expected, v1)) return { valid: false, reason: 'Signature mismatch.' };
  return { valid: true };
}

// Flutterwave: a static shared secret set in the dashboard, sent back
// verbatim in the "verif-hash" header — not an HMAC, just an exact
// match, but still compared in constant time.
export function verifyFlutterwaveSignature(hashHeader, secret) {
  if (!hashHeader || !secret) return { valid: false, reason: 'Missing signature or secret.' };
  if (!timingSafeEqualHex(hashHeader, secret)) return { valid: false, reason: 'Signature mismatch.' };
  return { valid: true };
}

// Coinbase Commerce: HMAC-SHA256 of the raw body with the webhook
// shared secret, hex-encoded, in the "X-CC-Webhook-Signature" header.
export function verifyCoinbaseSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return { valid: false, reason: 'Missing signature or secret.' };
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!timingSafeEqualHex(expected, sigHeader)) return { valid: false, reason: 'Signature mismatch.' };
  return { valid: true };
}
