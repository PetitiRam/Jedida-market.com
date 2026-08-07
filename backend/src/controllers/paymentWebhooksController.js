// Real payment confirmation for card/crypto checkouts (Stripe,
// Flutterwave, Coinbase Commerce, DPO). Mobile money (MTN/Airtel) is
// confirmed through a different, already-admin-gated path — see
// submitManualPayment() + adminPaymentsController.approvePayment() — a
// human reviews the transaction reference and proof image before funds
// move into escrow, so it doesn't need a webhook.
//
// Every request here is logged to payment_events (verified or not) —
// see schema_phase64_payment_webhook_security.sql — before any decision
// is made, so a forged or malformed callback still leaves a trail.
//
// IMPORTANT: these routes are mounted in server.js with express.raw()
// BEFORE the app-wide express.json(), so req.body here is the exact raw
// Buffer the provider sent — required for HMAC verification. Do not
// move these routes after express.json() or signature checks will
// always fail (the re-serialized JSON never byte-matches the original).

import { query } from '../config/db.js';
import { applyPaymentConfirmation } from './ordersController.js';
import { verifyStripeSignature, verifyFlutterwaveSignature, verifyCoinbaseSignature } from '../services/paymentWebhookSecurity.js';

async function logPaymentEvent({ provider, eventType, orderId, providerReference, signatureValid, actionTaken, detail, payload, req }) {
  try {
    await query(
      `INSERT INTO payment_events (provider, event_type, order_id, provider_reference, signature_valid, action_taken, detail, payload, source_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [provider, eventType || null, orderId || null, providerReference || null, signatureValid, actionTaken, detail || null, JSON.stringify(payload || {}), req.ip]
    );
  } catch (err) {
    // Logging must never be the reason a legitimate webhook fails —
    // but it should never be silent either.
    console.error('Failed to log payment_events row:', err);
  }
}

// Confirms escrow for the order matching a given provider_reference,
// using the same guarded transaction every other confirmation path uses
// (applyPaymentConfirmation only moves an order out of pending_payment
// once, so a provider's automatic webhook retries are always safe).
async function confirmByProviderReference(provider, providerReference, req, meta = {}) {
  const paymentRow = await query('SELECT order_id FROM payments WHERE provider_reference = $1', [providerReference]);
  const orderId = paymentRow.rows[0]?.order_id;
  if (!orderId) {
    await logPaymentEvent({ provider, orderId: null, providerReference, signatureValid: true, actionTaken: 'ignored', detail: 'No matching payment row for this reference.', payload: meta.payload, req, eventType: meta.eventType });
    return;
  }
  try {
    await applyPaymentConfirmation(orderId, { confirmedVia: `${provider}_webhook` });
    await logPaymentEvent({ provider, orderId, providerReference, signatureValid: true, actionTaken: 'confirmed', payload: meta.payload, req, eventType: meta.eventType });
  } catch (err) {
    // ALREADY_PROCESSED is the expected/normal outcome of a provider's
    // retried webhook — not an error worth alarming on.
    const detail = err.code === 'ALREADY_PROCESSED' ? 'Already confirmed (duplicate webhook delivery).' : err.message;
    await logPaymentEvent({ provider, orderId, providerReference, signatureValid: true, actionTaken: err.code === 'ALREADY_PROCESSED' ? 'ignored' : 'error', detail, payload: meta.payload, req, eventType: meta.eventType });
  }
}

export async function stripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const check = verifyStripeSignature(req.body, sig, secret);
  if (!check.valid) {
    await logPaymentEvent({ provider: 'stripe', signatureValid: false, actionTaken: 'rejected', detail: check.reason, req });
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    await logPaymentEvent({ provider: 'stripe', signatureValid: true, actionTaken: 'rejected', detail: 'Malformed JSON payload.', req });
    return res.status(400).json({ error: 'Malformed payload.' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    await confirmByProviderReference('stripe', session?.id, req, { eventType: event.type, payload: event });
  } else {
    await logPaymentEvent({ provider: 'stripe', signatureValid: true, actionTaken: 'ignored', detail: `Unhandled event type: ${event.type}`, payload: event, req, eventType: event.type });
  }
  return res.json({ received: true });
}

export async function flutterwaveWebhook(req, res) {
  const hash = req.headers['verif-hash'];
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  const check = verifyFlutterwaveSignature(hash, secret);
  if (!check.valid) {
    await logPaymentEvent({ provider: 'flutterwave', signatureValid: false, actionTaken: 'rejected', detail: check.reason, req });
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    await logPaymentEvent({ provider: 'flutterwave', signatureValid: true, actionTaken: 'rejected', detail: 'Malformed JSON payload.', req });
    return res.status(400).json({ error: 'Malformed payload.' });
  }

  const status = event.data?.status;
  const providerReference = event.data?.id ? String(event.data.id) : null;
  if (status === 'successful' && providerReference) {
    await confirmByProviderReference('flutterwave', providerReference, req, { eventType: event.event, payload: event });
  } else {
    await logPaymentEvent({ provider: 'flutterwave', signatureValid: true, actionTaken: 'ignored', detail: `status=${status}`, payload: event, req, eventType: event.event });
  }
  return res.json({ received: true });
}

export async function coinbaseWebhook(req, res) {
  const sig = req.headers['x-cc-webhook-signature'];
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  const check = verifyCoinbaseSignature(req.body, sig, secret);
  if (!check.valid) {
    await logPaymentEvent({ provider: 'coinbase', signatureValid: false, actionTaken: 'rejected', detail: check.reason, req });
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    await logPaymentEvent({ provider: 'coinbase', signatureValid: true, actionTaken: 'rejected', detail: 'Malformed JSON payload.', req });
    return res.status(400).json({ error: 'Malformed payload.' });
  }

  const eventType = event.event?.type;
  const providerReference = event.event?.data?.id;
  if (eventType === 'charge:confirmed' && providerReference) {
    await confirmByProviderReference('coinbase', providerReference, req, { eventType, payload: event });
  } else {
    await logPaymentEvent({ provider: 'coinbase', signatureValid: true, actionTaken: 'ignored', detail: `event=${eventType}`, payload: event, req, eventType });
  }
  return res.json({ received: true });
}

// DPO Pay has no signed-webhook scheme — its "callback" is just a
// redirect with a token in the query string, which is trivially
// forgeable. The only trustworthy way to confirm a DPO payment is to
// call DPO's own verifyToken API back and ask *them* what the status
// is, server-to-server, rather than trusting anything the client or an
// inbound request claims.
export async function dpoWebhook(req, res) {
  const token = req.body?.TransactionToken || req.query?.TransactionToken;
  if (!token) {
    await logPaymentEvent({ provider: 'dpo', signatureValid: false, actionTaken: 'rejected', detail: 'Missing TransactionToken.', req });
    return res.status(400).json({ error: 'Missing token.' });
  }
  if (!process.env.DPO_COMPANY_TOKEN) {
    await logPaymentEvent({ provider: 'dpo', signatureValid: false, actionTaken: 'rejected', detail: 'DPO is not configured on this server.', req });
    return res.status(501).json({ error: 'DPO is not configured.' });
  }

  try {
    const verifyBody = `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${process.env.DPO_COMPANY_TOKEN}</CompanyToken><Request>verifyToken</Request><TransactionToken>${token}</TransactionToken></API3G>`;
    const verifyRes = await fetch('https://secure.3gdirectpay.com/API/v6/', { method: 'POST', body: verifyBody });
    const text = await verifyRes.text();
    const approved = /<Result>000<\/Result>/.test(text);

    if (approved) {
      await confirmByProviderReference('dpo', token, req, { eventType: 'verifyToken', payload: { text } });
    } else {
      await logPaymentEvent({ provider: 'dpo', signatureValid: true, actionTaken: 'ignored', detail: 'DPO verifyToken did not report success.', payload: { text }, req, eventType: 'verifyToken' });
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('DPO webhook verify error:', err);
    await logPaymentEvent({ provider: 'dpo', signatureValid: false, actionTaken: 'error', detail: err.message, req });
    return res.status(502).json({ error: 'Could not verify with DPO.' });
  }
}
