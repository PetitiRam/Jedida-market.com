// PETITI Security Engine — the fraud-detection brain. Each scan function is
// a real, runnable heuristic against the actual schema (no mocked data),
// designed to be called on a schedule (cron) or on-demand from the Security
// Center / Fraud Monitoring Dashboard.

import { query } from '../../src/config/db.js';
import { log } from './petitiService.js';
import { respondToThreat } from './petitiResponseEngine.js';
import { adjustedRiskScore } from './petitiLearningEngine.js';

async function fileReport({ category, riskScore: baseScore, subjectUserId, subjectProductId, ip, details, evidence }) {
  // Section 6 ("self-learning security system"): every score passes through
  // the category's admin-review track record before it's used for
  // anything — one place, so every scan benefits without each one needing
  // its own learning-aware logic. See petitiLearningEngine.js.
  const riskScore = await adjustedRiskScore(category, baseScore);
  const result = await query(
    `INSERT INTO fraud_reports (category, risk_score, subject_user_id, subject_product_id, details, evidence)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [category, riskScore, subjectUserId || null, subjectProductId || null, details, evidence || {}]
  );
  // respondToThreat is the single place alerting + containment happens now
  // (low/medium/high tiers, per petitiResponseEngine.js) — replaces the
  // old inline "if riskScore >= 70, createAlert" check that used to live
  // here, so there's one tiering rule instead of two.
  // A fraud_report on a *product* has no account to contain (subjectUserId
  // is null for e.g. scanPriceAnomalies/scanDuplicateListings unless the
  // seller themself is the subject) — respondToThreat no-ops the account
  // containment steps in that case and just logs/alerts, so it's always
  // safe to call.
  await respondToThreat({ category, riskScore, subjectUserId, ip, details, evidence });
  return result.rows[0];
}

// ===== Authentication =====

export async function scanSuspiciousLogins() {
  // many failed refresh-token attempts / accounts created in bursts from same data signals
  const bursts = await query(`
    SELECT phone_number, COUNT(*) AS cnt FROM users
    WHERE created_at > now() - interval '1 hour'
    GROUP BY phone_number HAVING COUNT(*) > 1
  `);
  for (const row of bursts.rows) {
    await fileReport({
      category: 'multi_account_abuse', riskScore: 65,
      details: `Phone number ${row.phone_number} used for ${row.cnt} accounts within an hour.`,
      evidence: { phoneNumber: row.phone_number, count: row.cnt }
    });
  }
  return bursts.rows.length;
}

export async function scanFakeAccounts() {
  // unverified phone + no activity after N days is a soft fake-account signal
  const result = await query(`
    SELECT id, email, created_at FROM users
    WHERE phone_verified = FALSE AND created_at < now() - interval '7 days' AND status = 'active'
  `);
  for (const u of result.rows) {
    await fileReport({
      category: 'fake_account', riskScore: 40, subjectUserId: u.id,
      details: `Account ${u.email} never completed phone verification after 7+ days.`
    });
  }
  return result.rows.length;
}

export async function scanBruteForce(failedAttemptsByIp = {}) {
  // called from the auth rate-limiter hook in production; accepts a map of
  // { ip: failedCount } collected upstream, since brute-force signals live
  // at the request layer, not the DB.
  let flagged = 0;
  for (const [ip, count] of Object.entries(failedAttemptsByIp)) {
    if (count >= 8) {
      // 8-14 attempts: medium (restrict + alert). 15+: high — this is the
      // "multiple unauthorized admin access attempts" example from the
      // spec, so it earns the automatic IP block, not just a report.
      const riskScore = count >= 15 ? 85 : 65;
      await fileReport({ category: 'brute_force', riskScore, subjectUserId: null, ip, details: `${count} failed sign-in attempts from ${ip}.`, evidence: { ip, count } });
      flagged += 1;
    }
  }
  return flagged;
}

// Great-circle distance in km between two lat/lng points — used only to
// turn "two logins, two places, some time apart" into a travel speed.
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compares each user's two most recent successful logins that carry geo
// data (populated by authController.js via geoIpService.js). If the
// straight-line speed implied between them exceeds what commercial air
// travel can achieve, the account is almost certainly compromised or
// shared — nobody logs in from Lagos and Nairobi 20 minutes apart.
// Distinct from scanSuspiciousLogins (multi-account signup abuse) and
// scanBruteForce (repeated failures) — this only ever looks at pairs of
// *successful* logins for the same account.
export async function scanImpossibleTravel() {
  const latest = await query(`
    SELECT DISTINCT ON (email) email, ip_address, country, city, lat, lng, created_at
    FROM login_attempts
    WHERE success = TRUE AND lat IS NOT NULL AND lng IS NOT NULL
      AND created_at > now() - interval '24 hours'
    ORDER BY email, created_at DESC
  `);

  let flagged = 0;
  for (const cur of latest.rows) {
    const prevResult = await query(`
      SELECT ip_address, country, city, lat, lng, created_at FROM login_attempts
      WHERE success = TRUE AND email = $1 AND lat IS NOT NULL AND lng IS NOT NULL AND created_at < $2
      ORDER BY created_at DESC LIMIT 1
    `, [cur.email, cur.created_at]);
    const prev = prevResult.rows[0];
    if (!prev) continue;

    const hoursApart = (new Date(cur.created_at) - new Date(prev.created_at)) / 3600000;
    if (hoursApart <= 0 || hoursApart > 24) continue; // no signal on stale pairs

    const distanceKm = haversineKm(prev.lat, prev.lng, cur.lat, cur.lng);
    if (distanceKm < 300) continue; // same metro/region — normal ISP or mobile-network jitter

    const impliedSpeedKmh = distanceKm / hoursApart;
    if (impliedSpeedKmh <= 900) continue; // plausible for a long-haul commercial flight

    const userResult = await query('SELECT id FROM users WHERE email = $1', [cur.email]);
    const userId = userResult.rows[0]?.id || null;

    const alreadyFlagged = await query(`
      SELECT id FROM fraud_reports WHERE category = 'impossible_travel' AND subject_user_id = $1
        AND created_at > now() - interval '24 hours'
    `, [userId]);
    if (alreadyFlagged.rows.length > 0) continue;

    // Above ~3000 km/h nothing but a stolen session/credential explains it
    // (that's faster than the fastest commercial aircraft ever built).
    const riskScore = impliedSpeedKmh > 3000 ? 85 : 65;
    await fileReport({
      category: 'impossible_travel', riskScore, subjectUserId: userId, ip: cur.ip_address,
      details: `Account signed in from ${prev.city || prev.country || prev.ip_address} then ${cur.city || cur.country || cur.ip_address} ${hoursApart.toFixed(1)}h apart — implies ~${Math.round(impliedSpeedKmh).toLocaleString()} km/h travel.`,
      evidence: {
        ip: cur.ip_address,
        previous: { ip: prev.ip_address, country: prev.country, city: prev.city, at: prev.created_at },
        latest: { ip: cur.ip_address, country: cur.country, city: cur.city, at: cur.created_at },
        distanceKm: Math.round(distanceKm), impliedSpeedKmh: Math.round(impliedSpeedKmh)
      }
    });
    flagged += 1;
  }
  return flagged;
}

// Credential stuffing has the opposite shape from brute force: instead of
// many failed attempts against ONE account from one IP (scanBruteForce),
// it's one IP (or a small pool) working through MANY different accounts
// with only a handful of attempts each — the signature of a bot replaying
// a breached username/password list rather than guessing one target.
export async function scanCredentialStuffing() {
  const result = await query(`
    SELECT ip_address, COUNT(DISTINCT email)::int AS distinct_accounts, COUNT(*)::int AS total_attempts,
           COUNT(*) FILTER (WHERE success = TRUE)::int AS successes
    FROM login_attempts
    WHERE created_at > now() - interval '15 minutes' AND ip_address IS NOT NULL AND ip_address <> 'unknown'
    GROUP BY ip_address
    HAVING COUNT(DISTINCT email) >= 6
  `);

  let flagged = 0;
  for (const row of result.rows) {
    const alreadyFlagged = await query(`
      SELECT id FROM fraud_reports WHERE category = 'credential_stuffing'
        AND evidence->>'ip' = $1 AND created_at > now() - interval '15 minutes'
    `, [row.ip_address]);
    if (alreadyFlagged.rows.length > 0) continue;

    // A successful login mid-spray means at least one leaked credential
    // pair actually worked — escalate hard regardless of raw volume, since
    // that account needs immediate containment.
    const riskScore = row.successes > 0 ? 90 : row.distinct_accounts >= 15 ? 80 : 60;
    await fileReport({
      category: 'credential_stuffing', riskScore, subjectUserId: null, ip: row.ip_address,
      details: `${row.ip_address} attempted sign-ins against ${row.distinct_accounts} different accounts in 15 minutes (${row.total_attempts} attempts, ${row.successes} succeeded).`,
      evidence: { ip: row.ip_address, distinctAccounts: row.distinct_accounts, totalAttempts: row.total_attempts, successes: row.successes }
    });
    flagged += 1;
  }
  return flagged;
}

// ===== Dashboard reads: sessions & failed logins (Security Dashboard) =====

export async function listRecentFailedLogins(limit = 50) {
  const result = await query(
    `SELECT email, ip_address, user_agent, country, city, created_at
     FROM login_attempts WHERE success = FALSE
     ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Number(limit) || 50, 200)]
  );
  return result.rows;
}

export async function listActiveSessions(limit = 50) {
  const result = await query(
    `SELECT rt.id, rt.device_name, rt.platform, rt.last_used_at, rt.created_at, rt.expires_at,
            u.id AS user_id, u.email, u.full_name
     FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE rt.revoked = FALSE AND rt.expires_at > now()
     ORDER BY rt.last_used_at DESC NULLS LAST LIMIT $1`,
    [Math.min(Number(limit) || 50, 200)]
  );
  return result.rows;
}

// ===== Marketplace =====

export async function scanDuplicateListings() {
  const result = await query(`
    SELECT title, shop_id, COUNT(*) AS cnt, array_agg(id) AS ids
    FROM products WHERE status IN ('active','pending_review')
    GROUP BY title, shop_id HAVING COUNT(*) > 1
  `);
  for (const row of result.rows) {
    await fileReport({
      category: 'duplicate_listing', riskScore: 50, subjectProductId: row.ids[0],
      details: `${row.cnt} duplicate listings titled "${row.title}" in the same shop.`,
      evidence: { ids: row.ids }
    });
  }
  return result.rows.length;
}

export async function scanScamListings() {
  // heuristic: price implausibly low vs category average, or no description at all
  const result = await query(`
    SELECT p.id, p.title, p.price, p.category, p.shop_id
    FROM products p
    WHERE p.status IN ('active','pending_review')
      AND (p.description IS NULL OR length(p.description) < 5)
  `);
  for (const p of result.rows) {
    await fileReport({
      category: 'scam_listing', riskScore: 55, subjectProductId: p.id,
      details: `Listing "${p.title}" has no meaningful description — common in scam listings.`
    });
  }
  return result.rows.length;
}

// A price far below the category average is a common fake/scam-listing
// signal (e.g. "iPhone 15 — $20") — flags anything priced under 20% of its
// category's average among active listings, with at least 3 comparable
// listings to avoid false positives on thin categories.
export async function scanPriceAnomalies() {
  const result = await query(`
    WITH category_avg AS (
      SELECT category, AVG(price) AS avg_price, COUNT(*) AS sample_size
      FROM products WHERE status = 'active'
      GROUP BY category HAVING COUNT(*) >= 3
    )
    SELECT p.id, p.title, p.price, p.category, ca.avg_price
    FROM products p JOIN category_avg ca ON ca.category = p.category
    WHERE p.status IN ('active','pending_review') AND p.price < ca.avg_price * 0.2
  `);
  for (const p of result.rows) {
    await fileReport({
      category: 'scam_listing', riskScore: 60, subjectProductId: p.id,
      details: `Listing "${p.title}" priced at ${p.price}, far below the ${p.category.replace(/_/g, ' ')} category average of ${Number(p.avg_price).toFixed(2)} — common fake-listing pattern.`,
      evidence: { price: p.price, categoryAverage: p.avg_price }
    });
  }
  return result.rows.length;
}

export async function scanSellerAbuse() {
  const result = await query(`
    SELECT s.owner_id, COUNT(*) AS rejected_count
    FROM products p JOIN shops s ON s.id = p.shop_id
    WHERE p.status = 'rejected'
    GROUP BY s.owner_id HAVING COUNT(*) >= 3
  `);
  for (const row of result.rows) {
    await fileReport({
      category: 'seller_abuse', riskScore: 60, subjectUserId: row.owner_id,
      details: `Seller has had ${row.rejected_count} listings rejected — repeated policy violations.`
    });
  }
  return result.rows.length;
}

// ===== Financial =====

export async function scanWalletAbuse() {
  // rapid balance growth without corresponding completed orders
  const result = await query(`
    SELECT w.owner_id, w.balance
    FROM wallets w
    WHERE w.type = 'user' AND w.balance > 0 AND w.owner_id NOT IN (
      SELECT DISTINCT s.owner_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.status = 'completed'
    )
  `);
  for (const row of result.rows) {
    if (Number(row.balance) > 0) {
      await fileReport({
        category: 'wallet_abuse', riskScore: 45, subjectUserId: row.owner_id,
        details: `Wallet balance of ${row.balance} with no completed orders on record.`
      });
    }
  }
  return result.rows.length;
}

export async function scanSuspiciousTransactions() {
  const result = await query(`
    SELECT order_id, amount, currency FROM payments
    WHERE status = 'succeeded' AND amount > 5000
  `);
  for (const p of result.rows) {
    await fileReport({
      category: 'suspicious_transaction', riskScore: 50,
      details: `Unusually large payment of ${p.currency} ${p.amount} on order ${p.order_id}.`,
      evidence: { orderId: p.order_id, amount: p.amount }
    });
  }
  return result.rows.length;
}

// Runs every scan and returns a summary. This is what the Security Center's
// "Run full scan" button and a scheduled cron job both call.
export async function runFullScan() {
  const summary = {};
  summary.suspiciousLogins = await scanSuspiciousLogins();
  summary.impossibleTravel = await scanImpossibleTravel();
  summary.credentialStuffing = await scanCredentialStuffing();
  summary.fakeAccounts = await scanFakeAccounts();
  summary.duplicateListings = await scanDuplicateListings();
  summary.scamListings = await scanScamListings();
  summary.priceAnomalies = await scanPriceAnomalies();
  summary.sellerAbuse = await scanSellerAbuse();
  summary.walletAbuse = await scanWalletAbuse();
  summary.suspiciousTransactions = await scanSuspiciousTransactions();
  await log('petiti', 'info', 'security', 'Full fraud scan completed.', summary);
  return summary;
}

export async function computeRiskScore(userId) {
  const result = await query(
    `SELECT COALESCE(AVG(risk_score), 0) AS avg_score, COUNT(*) AS report_count
     FROM fraud_reports WHERE subject_user_id = $1 AND status != 'dismissed'`,
    [userId]
  );
  return { riskScore: Math.round(Number(result.rows[0].avg_score)), reportCount: Number(result.rows[0].report_count) };
}

export async function listFraudReports({ status, category } = {}) {
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`status = $${i}`); values.push(status); i += 1; }
  if (category) { conditions.push(`category = $${i}`); values.push(category); i += 1; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(`SELECT * FROM fraud_reports ${where} ORDER BY risk_score DESC, created_at DESC LIMIT 200`, values);
  return result.rows;
}

// Seller-facing view: fraud signals concerning THIS shop's own products or
// owner account — never another seller's data. Powers the AI Business
// Assistant's "Security" panel.
export async function listFraudReportsForShop(shopId, ownerId) {
  const result = await query(
    `SELECT fr.* FROM fraud_reports fr
     WHERE fr.subject_user_id = $2
        OR fr.subject_product_id IN (SELECT id FROM products WHERE shop_id = $1)
     ORDER BY fr.created_at DESC LIMIT 50`,
    [shopId, ownerId]
  );
  return result.rows;
}

// Re-exported so the controller only needs to import from one place for
// everything security-related. See petitiLearningEngine.js for the logic.
export { reviewFraudReport, getAllCategoryAccuracy } from './petitiLearningEngine.js';
