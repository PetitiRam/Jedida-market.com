// Each adapter exposes createCharge({ amount, currency, orderId, returnUrl })
// -> { providerReference, checkoutUrl, raw }. When the relevant secret key
// isn't set in .env, it falls back to a "sandbox" reference so the order/
// escrow flow is fully testable before real provider keys are wired in.

const sandbox = (provider, orderId) => ({
  providerReference: `${provider.toUpperCase()}-SANDBOX-${orderId}`,
  checkoutUrl: null,
  raw: { sandbox: true, provider }
});

export async function createStripeCharge({ amount, currency, orderId, returnUrl }) {
  if (!process.env.STRIPE_SECRET_KEY) return sandbox('stripe', orderId);
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      mode: 'payment',
      success_url: returnUrl,
      cancel_url: returnUrl,
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': `JEDIDA order ${orderId}`,
      'line_items[0][price_data][unit_amount]': Math.round(amount * 100),
      'line_items[0][quantity]': '1'
    })
  });
  const data = await res.json();
  return { providerReference: data.id, checkoutUrl: data.url, raw: data };
}

export async function createFlutterwaveCharge({ amount, currency, orderId, returnUrl }) {
  if (!process.env.FLUTTERWAVE_SECRET_KEY) return sandbox('flutterwave', orderId);
  const res = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tx_ref: `jedida-${orderId}-${Date.now()}`,
      amount, currency, redirect_url: returnUrl
    })
  });
  const data = await res.json();
  return { providerReference: data?.data?.id, checkoutUrl: data?.data?.link, raw: data };
}

export async function createDpoCharge({ amount, currency, orderId, returnUrl }) {
  if (!process.env.DPO_COMPANY_TOKEN) return sandbox('dpo', orderId);
  const body = `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${process.env.DPO_COMPANY_TOKEN}</CompanyToken><Request>createToken</Request><Transaction><PaymentAmount>${amount}</PaymentAmount><PaymentCurrency>${currency}</PaymentCurrency><CompanyRef>${orderId}</CompanyRef><RedirectURL>${returnUrl}</RedirectURL><BackURL>${returnUrl}</BackURL></Transaction></API3G>`;
  const res = await fetch('https://secure.3gdirectpay.com/API/v6/', { method: 'POST', body });
  const text = await res.text();
  // DPO's callback only ever gives us a TransactionToken to verify — so
  // that token, not our own orderId, is what has to be stored as
  // provider_reference for the webhook to be able to look the payment
  // back up by it later (see paymentWebhooksController.js's dpoWebhook).
  const token = text.match(/<TransactionToken>([^<]+)<\/TransactionToken>/)?.[1] || null;
  if (!token) {
    throw new Error(`DPO createToken did not return a TransactionToken: ${text}`);
  }
  return { providerReference: token, checkoutUrl: null, raw: { text } };
}

export async function createCoinbaseCharge({ amount, currency, orderId, returnUrl }) {
  if (!process.env.COINBASE_COMMERCE_API_KEY) return sandbox('coinbase', orderId);
  const res = await fetch('https://api.commerce.coinbase.com/charges', {
    method: 'POST',
    headers: {
      'X-CC-Api-Key': process.env.COINBASE_COMMERCE_API_KEY,
      'X-CC-Version': '2018-03-22',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `JEDIDA order ${orderId}`,
      pricing_type: 'fixed_price',
      local_price: { amount: String(amount), currency },
      redirect_url: returnUrl,
      cancel_url: returnUrl,
      metadata: { orderId }
    })
  });
  const data = await res.json();
  return { providerReference: data?.data?.id, checkoutUrl: data?.data?.hosted_url, raw: data };
}

// PesaJet Pay — mobile money (MTN / Airtel) via https://payments.pesajet.com.
//
// STATUS: LIVE REQUEST, MANUAL-VERIFY CONFIRMATION. Confirmed against a
// real test call against pay.pesajet.com on 2026-08-18:
//   POST /api/v1/payments  body: { type:'COLLECTION', amount, currency,
//     phoneNumber, provider:'mtn'|'airtel', reference, idempotencyKey }
//   -> { transactionId, type, status, amount, fee, currency, provider,
//        reference, createdAt, expiresAt }  (status seen: "PENDING")
//   GET /api/v1/payments/:transactionId
//   -> adds { phoneNumber, description, metadata, providerReference,
//             failureReason, updatedAt }
//   Error shape: { message, error, statusCode }
//
// STILL MISSING — and still never guessed:
//   - the terminal status string(s) for a completed vs. failed payment
//     (only "PENDING" has actually been observed so far)
//   - the webhook payload shape and its signature/auth scheme
// Because of that, this adapter still never marks a payment 'succeeded'
// on its own. createPesajetCharge() makes the real POST and stores the
// real transactionId. verifyPesajetPayment() makes the real GET. The only
// thing that moves a PesaJet payment toward 'succeeded' is
// checkPesajetStatus() in ordersController.js, which surfaces PesaJet's
// raw status text into the existing admin payment-review queue (the same
// one manual mtn/airtel proof submissions go through) for a human to read
// and approve — never an automatic string match against a guessed value.
export async function createPesajetCharge({ amount, currency, orderId, returnUrl, phoneNumber, network }) {
  if (!process.env.PESAJET_API_KEY) return sandbox('pesajet', orderId);

  if (!phoneNumber || !network) {
    throw new Error('PesaJet requires a phone number and network (mtn or airtel).');
  }

  const baseUrl = process.env.PESAJET_BASE_URL || 'https://payments.pesajet.com/api/v1';
  const idempotencyKey = `${orderId}-${Date.now()}`;

  const response = await fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.PESAJET_API_KEY },
    body: JSON.stringify({
      type: 'COLLECTION',
      amount,
      currency,
      phoneNumber,
      provider: network,
      reference: String(orderId),
      idempotencyKey
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`PesaJet payment request failed (${data.statusCode || response.status}): ${data.message || data.error || response.statusText}`);
  }

  return {
    providerReference: data.transactionId,
    checkoutUrl: null,
    raw: data
  };
}

export async function verifyPesajetPayment(transactionId) {
  if (!process.env.PESAJET_API_KEY) throw new Error('PESAJET_API_KEY is not set — cannot verify a live PesaJet payment.');

  const baseUrl = process.env.PESAJET_BASE_URL || 'https://payments.pesajet.com/api/v1';
  const response = await fetch(`${baseUrl}/payments/${transactionId}`, {
    headers: { 'X-API-Key': process.env.PESAJET_API_KEY }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`PesaJet status check failed (${data.statusCode || response.status}): ${data.message || data.error || response.statusText}`);
  }

  return data;
}

export const ADAPTERS = {

  stripe: createStripeCharge,
  pesajet: createPesajetCharge,
  flutterwave: createFlutterwaveCharge,
  dpo: createDpoCharge,
  coinbase: createCoinbaseCharge,

  mtn_mobile_money: async ({
    amount,
    currency,
    orderId
  }) => {

    return {
      providerReference: `MTN-${orderId}-${Date.now()}`,
      checkoutUrl: null,

      raw: {
        provider: "MTN Mobile Money",
        status: "manual_payment",
        amount,
        currency,
        instructions:
          "Pay to JEDIDA MTN Mobile Money number"
      }
    };
  },


  airtel_money: async ({
    amount,
    currency,
    orderId
  }) => {

    return {
      providerReference: `AIRTEL-${orderId}-${Date.now()}`,
      checkoutUrl: null,

      raw: {
        provider: "Airtel Money",
        status: "manual_payment",
        amount,
        currency,
        instructions:
          "Pay to JEDIDA Airtel Money number"
      }
    };
  }

};
