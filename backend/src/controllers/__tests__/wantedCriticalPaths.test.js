// wantedCriticalPaths.test.js
//
// CRITICAL JEDIDA WANTED GUARANTEES — brief §69/§70.
// Proves, against a real database, the handful of behaviors the whole
// Jedida Wanted brief hinges on:
//   1. A quote message containing a phone number is BLOCKED, not stored —
//      the core anti-scam/no-contact-sharing requirement (brief §3/§6/§29).
//   2. Accepting a quote creates a private, buyer-invisible bridge product
//      with the price/quantity LOCKED from the accepted quote — the fix
//      for the "reach out to the business directly" off-platform hole
//      (brief §2/§29/§30/§31, phase87).
//   3. A private Wanted post is invisible to a signed-in stranger — brief
//      §54/§40/§41.
//   4. offersEnabled=false actually blocks offer submission — proves the
//      admin feature flags (phase92) are real switches, not decorative.
//
// Uses Node's built-in test runner (node --test) — no new dependency,
// same convention as src/chat/__tests__/*.test.js. Run with a
// disposable/test database only:
//
//   DATABASE_URL=postgres://user:pass@host/jedida_test node --test src/controllers/__tests__/wantedCriticalPaths.test.js
//
// NEVER point DATABASE_URL at production when running this file — it
// creates and deletes real rows. Every fixture row is tracked and
// removed in the `after` hook, in FK-safe order, even if an assertion
// throws partway through.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../../config/db.js';
import {
  submitWantedQuote, acceptWantedQuote, getWantedRequest
} from '../wantedController.js';

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  return res;
}

let buyerId, businessId, strangerId, shopId, wantedRequestId, matchId, quoteId, bridgeProductId;

before(async () => {
  const stamp = Date.now();

  const buyer = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, primary_role)
     VALUES ($1,'x','Test Buyer','+256700000010','buyer') RETURNING id`,
    [`test-wanted-buyer-${stamp}@jedida.test`]
  );
  buyerId = buyer.rows[0].id;

  const business = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, primary_role)
     VALUES ($1,'x','Test Supplier','+256700000011','manufacturer') RETURNING id`,
    [`test-wanted-business-${stamp}@jedida.test`]
  );
  businessId = business.rows[0].id;

  const stranger = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, primary_role)
     VALUES ($1,'x','Test Stranger','+256700000012','buyer') RETURNING id`,
    [`test-wanted-stranger-${stamp}@jedida.test`]
  );
  strangerId = stranger.rows[0].id;

  const shop = await query(
    `INSERT INTO shops (owner_id, name, slug, status) VALUES ($1,'Test Supplier Shop',$2,'active') RETURNING id`,
    [businessId, `test-supplier-shop-${stamp}`]
  );
  shopId = shop.rows[0].id;

  const wr = await query(
    `INSERT INTO wanted_requests (buyer_id, title, description, category, category_source, quantity, visibility)
     VALUES ($1,'50 school uniforms','Blue and white, mixed sizes','fashion','buyer_override',50,'private')
     RETURNING id`,
    [buyerId]
  );
  wantedRequestId = wr.rows[0].id;

  const match = await query(
    `INSERT INTO wanted_request_matches (wanted_request_id, business_id, shop_id, match_score, match_reasons)
     VALUES ($1,$2,$3,60,'[]') RETURNING id`,
    [wantedRequestId, businessId, shopId]
  );
  matchId = match.rows[0].id;
});

after(async () => {
  if (bridgeProductId) await query('DELETE FROM products WHERE id = $1', [bridgeProductId]);
  if (quoteId) await query('DELETE FROM wanted_request_quotes WHERE id = $1', [quoteId]);
  if (matchId) await query('DELETE FROM wanted_request_matches WHERE id = $1', [matchId]);
  if (wantedRequestId) await query('DELETE FROM wanted_requests WHERE id = $1', [wantedRequestId]);
  if (shopId) await query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (buyerId) await query('DELETE FROM users WHERE id = $1', [buyerId]);
  if (businessId) await query('DELETE FROM users WHERE id = $1', [businessId]);
  if (strangerId) await query('DELETE FROM users WHERE id = $1', [strangerId]);
  await pool.end();
});

test('a quote message containing a phone number is blocked, never stored', async () => {
  const req = {
    user: { id: businessId },
    body: { matchId, unitPrice: 25000, currency: 'UGX', message: 'Call me on 0700123456 to skip the fees' }
  };
  const res = mockRes();
  await submitWantedQuote(req, res);

  assert.equal(res.statusCode, 400, 'a phone number in the message must be rejected with 400');
  assert.match(res.body.error, /cannot be shared here/i);

  const stored = await query('SELECT * FROM wanted_request_quotes WHERE match_id = $1', [matchId]);
  assert.equal(stored.rows.length, 0, 'CRITICAL: the blocked quote must never be inserted at all');
});

test('accepting a quote creates a private bridge product with the accepted price/quantity locked, invisible to public browse', async () => {
  const submitReq = { user: { id: businessId }, body: { matchId, unitPrice: 18500, currency: 'UGX', moq: 50, leadTimeDays: 5 } };
  const submitRes = mockRes();
  await submitWantedQuote(submitReq, submitRes);
  assert.equal(submitRes.statusCode, 201, `quote submission should succeed: ${JSON.stringify(submitRes.body)}`);
  quoteId = submitRes.body.quote.id;

  const acceptReq = { user: { id: buyerId }, params: { quoteId } };
  const acceptRes = mockRes();
  await acceptWantedQuote(acceptReq, acceptRes);
  assert.equal(acceptRes.statusCode, 200, `accept should succeed: ${JSON.stringify(acceptRes.body)}`);
  assert.doesNotMatch(
    acceptRes.body.message.toLowerCase(),
    /reach out|arrange.*directly|contact the (business|supplier)/,
    'CRITICAL: acceptance must never tell the buyer to leave the platform (brief §2/§29)'
  );
  assert.ok(acceptRes.body.checkout?.productId, 'acceptance must hand back a Jedida checkout product');
  bridgeProductId = acceptRes.body.checkout.productId;

  const product = await query('SELECT * FROM products WHERE id = $1', [bridgeProductId]);
  assert.equal(Number(product.rows[0].price), 18500, 'bridge product price must equal the accepted quote price exactly');
  assert.equal(product.rows[0].quantity_available, 50, 'bridge product quantity must equal the accepted MOQ exactly');
  assert.equal(product.rows[0].status, 'draft', 'bridge product must stay draft — never enter public browse');

  const publicBrowse = await query(`SELECT 1 FROM products WHERE id = $1 AND status = 'active'`, [bridgeProductId]);
  assert.equal(publicBrowse.rows.length, 0, 'CRITICAL: the bridge product must never satisfy the public-browse status filter');

  const checkoutEligible = await query(
    `SELECT 1 FROM products WHERE id = $1 AND (status = 'active' OR wanted_quote_id IS NOT NULL)`,
    [bridgeProductId]
  );
  assert.equal(checkoutEligible.rows.length, 1, 'the bridge product must still be orderable through the narrow wanted-bridge allowance');
});

test('a private Wanted post is invisible to a signed-in stranger', async () => {
  const req = { user: { id: strangerId }, params: { id: wantedRequestId } };
  const res = mockRes();
  await getWantedRequest(req, res);
  assert.equal(res.statusCode, 403, 'a private post must return 403 to a non-owner, non-matched, non-admin viewer');
});

test('disabling offersEnabled actually blocks offer submission (feature flags are real, not decorative)', async () => {
  const before_ = await query('SELECT wanted_settings FROM platform_settings WHERE id = 1');
  const original = before_.rows[0].wanted_settings;

  try {
    await query(`UPDATE platform_settings SET wanted_settings = wanted_settings || '{"offersEnabled": false}'::jsonb WHERE id = 1`);

    const req2 = { user: { id: businessId }, body: { matchId, unitPrice: 9999, currency: 'UGX' } };
    const res2 = mockRes();
    await submitWantedQuote(req2, res2);
    assert.equal(res2.statusCode, 403, 'offer submission must be blocked while offersEnabled is false');
  } finally {
    await query('UPDATE platform_settings SET wanted_settings = $1 WHERE id = 1', [JSON.stringify(original)]);
  }
});
