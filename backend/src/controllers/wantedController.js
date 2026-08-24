import { query, withTransaction } from '../config/db.js';
import { askLLMForJson, isLLMConfigured } from '../services/llmClient.js';
import { B2B_ROLES } from './b2bCatalogController.js';
import { scanMessageText, ORDER_PROTECTION_REMINDER } from '../chat/contactModerationEngine.js';
import { getSection as getSettingsSection } from '../services/settingsService.js';

// Feature flags (brief §43/§44) — reads the 'wanted' settings section
// (phase92) fresh each call. A single-row JSONB lookup is cheap enough
// not to need a cache, and always reflects the latest admin change —
// no stale-toggle window like a cached flag would have.
async function getWantedSettings() {
  return getSettingsSection('wanted');
}

// Every INSERT INTO notifications in this file goes through here so the
// notificationsEnabled flag (brief §43) is enforced in exactly one place.
// queryFn is either the top-level `query` or a transaction's
// `client.query` — both share the same (sql, params) signature.
async function notifyWantedUser(queryFn, { userId, type, title, body, metadata }) {
  const settings = await getWantedSettings();
  if (settings.notificationsEnabled === false) return;
  await queryFn(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata || {})]
  );
}

// The full product_category enum (schema_phase2) — kept in sync manually
// since node-postgres has no easy "list enum labels" helper without an
// extra round trip. If a new category is ever added to the enum, add it
// here and to KEYWORD_CATEGORY_MAP below.
const CATEGORIES = [
  'agriculture', 'electronics', 'fashion', 'home_and_garden', 'health_and_beauty',
  'vehicles', 'food_and_beverages', 'sports_and_outdoors', 'books_and_media',
  'toys_and_kids', 'art_and_crafts', 'services', 'other'
];

// Deterministic fallback so "Post What I Want" still works end-to-end with
// no LLM provider configured — same pattern as every other AI bot in this
// codebase (see llmClient.js header comment / nsubugaJosephBot.js).
const KEYWORD_CATEGORY_MAP = [
  { category: 'agriculture', keywords: ['maize', 'seed', 'fertilizer', 'irrigation', 'farm', 'crop', 'livestock', 'poultry', 'grain', 'tractor'] },
  { category: 'electronics', keywords: ['phone', 'laptop', 'solar panel', 'battery', 'cctv', 'computer', 'charger', 'led', 'inverter', 'electronic'] },
  { category: 'fashion', keywords: ['uniform', 'fabric', 'clothing', 'shoe', 'garment', 'textile', 'shirt', 'dress', 'bag', 'apparel'] },
  { category: 'home_and_garden', keywords: ['furniture', 'cement', 'tile', 'roofing', 'steel', 'plumbing', 'paint', 'construction', 'mattress'] },
  { category: 'health_and_beauty', keywords: ['cosmetic', 'skincare', 'medical', 'hygiene', 'pharma', 'supplement'] },
  { category: 'vehicles', keywords: ['vehicle', 'car', 'motorcycle', 'spare part', 'tire', 'tyre', 'engine'] },
  { category: 'food_and_beverages', keywords: ['food', 'beverage', 'rice', 'sugar', 'cooking oil', 'flour', 'drink', 'snack'] },
  { category: 'sports_and_outdoors', keywords: ['sport', 'gym', 'fitness', 'outdoor', 'camping'] },
  { category: 'books_and_media', keywords: ['book', 'stationery', 'textbook', 'printing'] },
  { category: 'toys_and_kids', keywords: ['toy', 'kids', 'baby', 'school supplies'] },
  { category: 'art_and_crafts', keywords: ['craft', 'art supplies', 'packaging material'] },
  { category: 'services', keywords: ['service', 'consulting', 'logistics service', 'freight'] }
];

function classifyByKeywords(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  for (const entry of KEYWORD_CATEGORY_MAP) {
    if (entry.keywords.some((kw) => text.includes(kw))) {
      return { category: entry.category, confidence: 0.55, source: 'keyword_fallback' };
    }
  }
  return { category: 'other', confidence: 0.2, source: 'keyword_fallback' };
}

// AI classification with a deterministic fallback — never blocks request
// creation if no LLM provider is configured or the call fails/returns
// something unusable.
async function classifyWantedRequest(title, description) {
  if (!isLLMConfigured()) return classifyByKeywords(title, description);

  try {
    const system = `You classify a B2B buyer's sourcing request into exactly one category from this fixed list: ${CATEGORIES.join(', ')}. Respond with JSON: {"category": "<one of the list>", "confidence": <0 to 1 number>}.`;
    const result = await askLLMForJson(system, `Title: ${title}\nDescription: ${description}`, { maxTokens: 100 });
    if (result && CATEGORIES.includes(result.category)) {
      const confidence = typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.7;
      return { category: result.category, confidence, source: 'ai' };
    }
    return classifyByKeywords(title, description);
  } catch (err) {
    console.error('Wanted request AI classification error, falling back to keywords:', err.message);
    return classifyByKeywords(title, description);
  }
}

async function logWantedAction(wantedRequestId, actorId, action, metadata = {}) {
  try {
    await query(
      `INSERT INTO wanted_request_audit_log (wanted_request_id, actor_id, action, metadata)
       VALUES ($1, $2, $3, $4)`,
      [wantedRequestId, actorId, action, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Wanted audit log error:', err);
  }
}

// ------------------------------------------------------------
// "Jedida Recommended" (brief §21) — configurable-in-spirit ranking
// over REAL data only: price (lower is better) and the shop's existing
// trust_score (trustEngineService.js, computed from actual completed
// orders/reviews/delivery performance — never fabricated here). This
// intentionally does not fabricate values for quotes with no
// shop_trust_metrics row yet (a brand-new shop) — those simply aren't
// eligible for the badge rather than being scored as if trust_score
// were 0, which would unfairly bury new but otherwise-good offers.
// Needs at least 2 comparable submitted offers before recommending one
// at all — with only one offer "recommended" would just mean "the only
// option", which isn't a recommendation.
// ------------------------------------------------------------
function markRecommendedOffer(quotes) {
  const candidates = quotes.filter((q) => q.status === 'submitted' && q.trust_score !== null && q.trust_score !== undefined);
  if (candidates.length < 2) return quotes.map((q) => ({ ...q, recommended: false }));

  const prices = candidates.map((q) => Number(q.unit_price));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceScore = (p) => (maxPrice === minPrice ? 1 : 1 - (Number(p) - minPrice) / (maxPrice - minPrice)); // 1 = cheapest

  let bestId = null;
  let bestScore = -Infinity;
  for (const q of candidates) {
    // Even weight between price competitiveness and the shop's real
    // track record — a simple, explainable starting point; the brief
    // (§21) leaves the exact weighting admin-configurable for later.
    const combined = priceScore(q.unit_price) * 0.5 + (Number(q.trust_score) / 100) * 0.5;
    if (combined > bestScore) { bestScore = combined; bestId = q.id; }
  }

  return quotes.map((q) => ({ ...q, recommended: q.id === bestId }));
}

// ------------------------------------------------------------
// Explainable matching engine. Every point on the score comes from a
// named, storable reason — no opaque AI ranking (see the trust-engine
// requirement: scores must be explainable and auditable). Returns the
// top MAX_MATCHES candidates.
// ------------------------------------------------------------
const MAX_MATCHES = 10;

async function findAndInviteMatches(client, wantedRequest) {
  const { id: wantedRequestId, category, preferred_supplier_country, destination_country } = wantedRequest;

  const candidatesResult = await client.query(
    `SELECT u.id AS business_id, u.primary_role, u.status AS user_status,
            bp.company_country, bp.status AS profile_status,
            s.id AS shop_id, s.primary_category, s.status AS shop_status
     FROM users u
     JOIN business_profiles bp ON bp.user_id = u.id
     LEFT JOIN shops s ON s.owner_id = u.id AND s.status = 'active'
     WHERE u.primary_role = ANY($1::user_role[])
       AND u.status = 'active'
       AND bp.status = 'active'`,
    [B2B_ROLES]
  );

  const scored = [];
  const seenBusiness = new Set();
  for (const row of candidatesResult.rows) {
    if (seenBusiness.has(row.business_id)) continue;
    seenBusiness.add(row.business_id);

    let score = 0;
    const reasons = [];

    if (row.primary_category === category) {
      score += 60;
      reasons.push({ factor: 'category_match', weight: 60, detail: `Storefront category matches "${category}".` });
    } else {
      score += 15;
      reasons.push({ factor: 'category_broad', weight: 15, detail: 'Verified B2B business without an exact category match on file.' });
    }

    const preferredCountry = preferred_supplier_country || destination_country;
    if (preferredCountry && row.company_country && row.company_country.toLowerCase() === preferredCountry.toLowerCase()) {
      score += 25;
      reasons.push({ factor: 'country_match', weight: 25, detail: `Business is based in ${row.company_country}, matching the requested sourcing country.` });
    }

    // profile_status = 'active' already means the business's KYC/company
    // documents cleared review (see business_profiles.status in phase37)
    // — that verification itself is worth a small explainable bonus.
    score += 15;
    reasons.push({ factor: 'verified_business_profile', weight: 15, detail: 'Business profile has passed Jedida review.' });

    scored.push({ businessId: row.business_id, shopId: row.shop_id || null, score: Math.min(100, score), reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_MATCHES);

  const inserted = [];
  for (const match of top) {
    const result = await client.query(
      `INSERT INTO wanted_request_matches (wanted_request_id, business_id, shop_id, match_score, match_reasons)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (wanted_request_id, business_id) DO NOTHING
       RETURNING *`,
      [wantedRequestId, match.businessId, match.shopId, match.score, JSON.stringify(match.reasons)]
    );
    if (result.rows[0]) inserted.push(result.rows[0]);
  }

  if (inserted.length > 0) {
    await client.query(
      `UPDATE wanted_requests SET status = 'matched', match_count = $2 WHERE id = $1`,
      [wantedRequestId, inserted.length]
    );
    for (const m of inserted) {
      await notifyWantedUser(client.query.bind(client), {
        userId: m.business_id, type: 'wanted_request_matched', title: 'New sourcing request for you',
        body: 'A buyer is looking for products in your category — respond with a quote.',
        metadata: { wantedRequestId }
      });
    }
  } else {
    await client.query(`UPDATE wanted_requests SET status = 'submitted' WHERE id = $1`, [wantedRequestId]);
  }

  return inserted;
}

// ------------------------------------------------------------
// BUYER — post a want
// ------------------------------------------------------------
export async function createWantedRequest(req, res) {
  const {
    title, description, quantity, unit, budgetMin, budgetMax, currency,
    destinationCountry, destinationCity, requiredByDate, specifications,
    qualityRequirements, preferredSupplierCountry, shippingPreference,
    sampleRequired, customizationRequired, attachmentUrls, categoryOverride,
    visibility
  } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required.' });
  }
  if (quantity !== undefined && quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) {
    return res.status(400).json({ error: 'quantity must be a whole number greater than 0.' });
  }

  const settings = await getWantedSettings();
  if (settings.wantedPostsEnabled === false) {
    return res.status(403).json({ error: 'Posting a Wanted request is temporarily unavailable.' });
  }

  // Brief §15: buyer-controlled visibility. Only the two states this
  // feature actually implements — see phase88 migration header for why
  // 'followers_community' / 'invited_suppliers' aren't offered yet. If an
  // admin has disabled one whole mode (brief §43), the request is forced
  // into whichever mode is still available rather than silently ignored.
  let requestVisibility = visibility === 'private' ? 'private' : 'public';
  if (requestVisibility === 'public' && settings.publicFeedEnabled === false) requestVisibility = 'private';
  if (requestVisibility === 'private' && settings.privateRequestsEnabled === false) requestVisibility = 'public';
  if (settings.publicFeedEnabled === false && settings.privateRequestsEnabled === false) {
    return res.status(403).json({ error: 'Posting a Wanted request is temporarily unavailable.' });
  }

  try {
    let classification;
    if (categoryOverride && CATEGORIES.includes(categoryOverride)) {
      classification = { category: categoryOverride, confidence: null, source: 'buyer_override' };
    } else {
      classification = await classifyWantedRequest(title, description);
    }

    const wantedRequest = await withTransaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO wanted_requests
           (buyer_id, title, description, category, category_source, category_confidence,
            quantity, unit, budget_min, budget_max, currency,
            destination_country, destination_city, required_by_date,
            specifications, quality_requirements, preferred_supplier_country,
            shipping_preference, sample_required, customization_required, visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [
          req.user.id, title, description, classification.category, classification.source, classification.confidence,
          quantity || null, unit || null, budgetMin || null, budgetMax || null, currency || 'USD',
          destinationCountry || null, destinationCity || null, requiredByDate || null,
          specifications || null, qualityRequirements || null, preferredSupplierCountry || null,
          shippingPreference || null, Boolean(sampleRequired), Boolean(customizationRequired), requestVisibility
        ]
      );
      const created = insertResult.rows[0];

      if (Array.isArray(attachmentUrls)) {
        for (const url of attachmentUrls.slice(0, 10)) {
          if (typeof url === 'string' && url.trim()) {
            await client.query(
              `INSERT INTO wanted_request_attachments (wanted_request_id, file_url) VALUES ($1, $2)`,
              [created.id, url.trim()]
            );
          }
        }
      }

      await findAndInviteMatches(client, created);

      const refreshed = await client.query('SELECT * FROM wanted_requests WHERE id = $1', [created.id]);
      return refreshed.rows[0];
    });

    await logWantedAction(wantedRequest.id, req.user.id, 'created', {
      category: wantedRequest.category, categorySource: wantedRequest.category_source
    });

    return res.status(201).json({ message: 'Your request has been posted and matched to suitable businesses.', wantedRequest });
  } catch (err) {
    console.error('Create wanted request error:', err);
    return res.status(500).json({ error: 'Could not post your request.' });
  }
}

export async function myWantedRequests(req, res) {
  try {
    const result = await query(
      `SELECT wr.*,
              (SELECT COUNT(*) FROM wanted_request_quotes q WHERE q.wanted_request_id = wr.id) AS live_quote_count,
              EXISTS(SELECT 1 FROM wanted_likes wl WHERE wl.wanted_request_id = wr.id AND wl.user_id = $1) AS liked_by_me
       FROM wanted_requests wr
       WHERE wr.buyer_id = $1
       ORDER BY wr.created_at DESC`,
      [req.user.id]
    );
    return res.json({ wantedRequests: result.rows });
  } catch (err) {
    console.error('My wanted requests error:', err);
    return res.status(500).json({ error: 'Could not load your requests.' });
  }
}

// ------------------------------------------------------------
// PUBLIC FEED — brief §9/§10. Shows public Wanted posts to anyone
// (optionalAuth: liked_by_me only populates when signed in). Private
// requests (§54) never appear here regardless of who's asking — only
// the buyer/admin can see those, via getWantedRequest.
// ------------------------------------------------------------
const FEED_PAGE_SIZE = 20;

export async function getWantedFeed(req, res) {
  const settings = await getWantedSettings();
  if (settings.publicFeedEnabled === false) {
    return res.json({ posts: [], nextCursor: null, disabled: true });
  }

  const cursor = req.query.cursor || null; // created_at of the last row the client already has
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const userId = req.user?.id || null;

  try {
    const conditions = [`wr.visibility = 'public'`, `wr.status NOT IN ('cancelled', 'removed_by_admin')`];
    const params = [userId];
    if (cursor) { params.push(cursor); conditions.push(`wr.created_at < $${params.length}`); }
    if (category) { params.push(category); conditions.push(`wr.category = $${params.length}`); }

    const result = await query(
      `SELECT wr.id, wr.title, wr.description, wr.category, wr.quantity, wr.unit,
              wr.budget_min, wr.budget_max, wr.currency, wr.destination_country, wr.destination_city,
              wr.required_by_date, wr.status, wr.like_count, wr.reply_count, wr.quote_count,
              wr.created_at,
              u.id AS buyer_id, u.full_name AS buyer_name, u.avatar_url AS buyer_avatar,
              (u.kyc_status = 'approved') AS buyer_verified,
              EXISTS(SELECT 1 FROM wanted_likes wl WHERE wl.wanted_request_id = wr.id AND wl.user_id = $1) AS liked_by_me
       FROM wanted_requests wr
       JOIN users u ON u.id = wr.buyer_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY wr.created_at DESC
       LIMIT ${FEED_PAGE_SIZE}`,
      params
    );

    const rows = result.rows;
    const nextCursor = rows.length === FEED_PAGE_SIZE ? rows[rows.length - 1].created_at : null;
    return res.json({ posts: rows, nextCursor });
  } catch (err) {
    console.error('Wanted feed error:', err);
    return res.status(500).json({ error: 'Could not load the Wanted feed.' });
  }
}

// getWantedRequest — the owner/admin see full detail (matches + quotes).
// Anyone else may view a PUBLIC post's core content + replies (brief §9),
// but never another buyer's matches/quotes — those carry supplier
// identities and pricing that stay private per §40/§41. A private post
// (§54) is invisible to everyone except its buyer/admin.
export async function getWantedRequest(req, res) {
  try {
    const wrResult = await query('SELECT * FROM wanted_requests WHERE id = $1', [req.params.id]);
    const wantedRequest = wrResult.rows[0];
    if (!wantedRequest) return res.status(404).json({ error: 'Request not found.' });

    const viewerId = req.user?.id || null;
    const isOwner = viewerId === wantedRequest.buyer_id;
    const isAdmin = Boolean(req.user?.isAdmin);

    if (!isOwner && !isAdmin) {
      if (wantedRequest.visibility !== 'public' || wantedRequest.status === 'removed_by_admin') {
        return res.status(403).json({ error: 'You do not have access to this request.' });
      }
      const [attachments, replies] = await Promise.all([
        query('SELECT * FROM wanted_request_attachments WHERE wanted_request_id = $1', [req.params.id]),
        query(
          `SELECT r.id, r.body, r.quote_id, r.created_at,
                  u.full_name AS author_name, u.avatar_url AS author_avatar
           FROM wanted_replies r JOIN users u ON u.id = r.user_id
           WHERE r.wanted_request_id = $1 ORDER BY r.created_at ASC`,
          [req.params.id]
        )
      ]);
      return res.json({ wantedRequest, attachments: attachments.rows, replies: replies.rows, matches: [], quotes: [] });
    }

    const [matches, quotes, attachments, replies] = await Promise.all([
      query(
        `SELECT m.*, s.name AS shop_name, s.slug AS shop_slug, u.full_name AS business_name
         FROM wanted_request_matches m
         JOIN users u ON u.id = m.business_id
         LEFT JOIN shops s ON s.id = m.shop_id
         WHERE m.wanted_request_id = $1 ORDER BY m.match_score DESC`,
        [req.params.id]
      ),
      query(
        // Comparison data (brief §20/§21) — real trust signals only,
        // via the existing shop_trust_metrics table (trustEngineService.js),
        // never fabricated. (kyc_status = 'approved') is a second,
        // independent verification signal shown alongside it.
        `SELECT q.*, s.name AS shop_name, u.full_name AS business_name,
                (u.kyc_status = 'approved') AS business_verified,
                tm.trust_score, tm.delivery_score, tm.completed_orders_count
         FROM wanted_request_quotes q
         JOIN users u ON u.id = q.business_id
         LEFT JOIN shops s ON s.id = q.shop_id
         LEFT JOIN shop_trust_metrics tm ON tm.shop_id = q.shop_id
         WHERE q.wanted_request_id = $1 ORDER BY q.unit_price ASC`,
        [req.params.id]
      ),
      query('SELECT * FROM wanted_request_attachments WHERE wanted_request_id = $1', [req.params.id]),
      query(
        `SELECT r.id, r.body, r.quote_id, r.created_at,
                u.full_name AS author_name, u.avatar_url AS author_avatar
         FROM wanted_replies r JOIN users u ON u.id = r.user_id
         WHERE r.wanted_request_id = $1 ORDER BY r.created_at ASC`,
        [req.params.id]
      )
    ]);

    return res.json({
      wantedRequest, matches: matches.rows, quotes: markRecommendedOffer(quotes.rows),
      attachments: attachments.rows, replies: replies.rows
    });
  } catch (err) {
    console.error('Get wanted request error:', err);
    return res.status(500).json({ error: 'Could not load this request.' });
  }
}

export async function cancelWantedRequest(req, res) {
  try {
    const result = await query(
      `UPDATE wanted_requests SET status = 'cancelled' WHERE id = $1 AND buyer_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Request not found.' });
    await logWantedAction(req.params.id, req.user.id, 'cancelled', {});
    return res.json({ message: 'Request cancelled.', wantedRequest: result.rows[0] });
  } catch (err) {
    console.error('Cancel wanted request error:', err);
    return res.status(500).json({ error: 'Could not cancel this request.' });
  }
}

// ------------------------------------------------------------
// BUSINESS SIDE — matched manufacturer/supplier/farmer accounts
// ------------------------------------------------------------
export async function incomingWantedMatches(req, res) {
  try {
    const result = await query(
      `SELECT m.*, wr.title, wr.description, wr.category, wr.quantity, wr.unit,
              wr.budget_min, wr.budget_max, wr.currency, wr.destination_country,
              wr.destination_city, wr.required_by_date, wr.status AS request_status,
              latest_quote.id AS quote_id, latest_quote.status AS quote_status,
              latest_quote.unit_price AS quote_unit_price
       FROM wanted_request_matches m
       JOIN wanted_requests wr ON wr.id = m.wanted_request_id
       LEFT JOIN LATERAL (
         SELECT q.id, q.status, q.unit_price FROM wanted_request_quotes q
         WHERE q.match_id = m.id ORDER BY q.created_at DESC LIMIT 1
       ) latest_quote ON true
       WHERE m.business_id = $1 AND wr.status != 'cancelled'
       ORDER BY m.invited_at DESC`,
      [req.user.id]
    );
    return res.json({ matches: result.rows });
  } catch (err) {
    console.error('Incoming wanted matches error:', err);
    return res.status(500).json({ error: 'Could not load incoming requests.' });
  }
}

export async function respondToWantedMatch(req, res) {
  const { status } = req.body; // 'viewed' | 'declined'
  if (!['viewed', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be viewed or declined.' });
  }
  try {
    const result = await query(
      `UPDATE wanted_request_matches
       SET status = $3, responded_at = now()
       WHERE id = $1 AND business_id = $2 AND status != 'quoted'
       RETURNING *`,
      [req.params.matchId, req.user.id, status]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Match not found.' });
    return res.json({ message: 'Updated.', match: result.rows[0] });
  } catch (err) {
    console.error('Respond to wanted match error:', err);
    return res.status(500).json({ error: 'Could not update this match.' });
  }
}

const VALID_AVAILABILITY = ['in_stock', 'made_to_order', 'limited'];

// ------------------------------------------------------------
// Shared by submitWantedQuote (existing matched-invite flow) and
// submitWantedOffer (new — offer directly on a public post, brief §18).
// Runs contact-moderation on the message, validates the structured
// Offer fields (§17), inserts the quote, and keeps match/request
// counters in sync. Both callers already resolved `match` themselves —
// this never trusts client-supplied ids beyond that point.
// ------------------------------------------------------------
async function createOfferForMatch(req, match, body) {
  const { unitPrice, currency, moq, leadTimeDays, message, warranty, specifications, availability, expiresAt } = body;

  const settings = await getWantedSettings();
  if (settings.offersEnabled === false) {
    throw Object.assign(new Error('Submitting offers is temporarily unavailable.'), { statusCode: 403 });
  }

  if (unitPrice === undefined || unitPrice === null || typeof unitPrice !== 'number' || unitPrice < 0) {
    throw Object.assign(new Error('unitPrice must be a non-negative number.'), { statusCode: 400 });
  }
  if (availability && !VALID_AVAILABILITY.includes(availability)) {
    throw Object.assign(new Error(`availability must be one of: ${VALID_AVAILABILITY.join(', ')}`), { statusCode: 400 });
  }
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
    throw Object.assign(new Error('expiresAt must be a valid date.'), { statusCode: 400 });
  }

  // Anti-scam / no-contact-sharing (see Jedida Wanted brief §3, §6, §29):
  // a quote's free-text message is the one field a supplier could use to
  // push the buyer off-platform ("call me on...", a phone number, a
  // WhatsApp handle). Reuse the same detection engine that already
  // protects order/chat conversations rather than building a second one.
  // contactProtectionEnabled (brief §43) is the platform operator's own
  // configuration switch for this moderation system — defaults on.
  let quoteMessage = message || null;
  if (quoteMessage && settings.contactProtectionEnabled !== false) {
    const scan = scanMessageText(quoteMessage);
    if (scan.action === 'block') {
      await logWantedAction(match.wanted_request_id, req.user.id, 'quote_message_blocked', {
        matchId: match.id, violations: scan.violations.map((v) => v.type)
      });
      throw Object.assign(new Error(
        'For your protection, direct contact details cannot be shared here. Please continue the conversation and transaction through Jedida.'
      ), { statusCode: 400 });
    }
    if (scan.action === 'mask') quoteMessage = scan.maskedText;
  }

  const quote = await withTransaction(async (client) => {
    const insertResult = await client.query(
      `INSERT INTO wanted_request_quotes
         (wanted_request_id, match_id, business_id, shop_id, unit_price, currency, moq, lead_time_days,
          message, warranty, specifications, availability, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        match.wanted_request_id, match.id, req.user.id, match.shop_id, unitPrice, currency || 'USD',
        moq || null, leadTimeDays || null, quoteMessage, warranty || null, specifications || null,
        availability || null, expiresAt || null
      ]
    );
    await client.query(`UPDATE wanted_request_matches SET status = 'quoted', responded_at = now() WHERE id = $1`, [match.id]);
    await client.query(
      `UPDATE wanted_requests SET status = 'quoted', quote_count = quote_count + 1 WHERE id = $1`,
      [match.wanted_request_id]
    );
    return insertResult.rows[0];
  });

  const buyerResult = await query('SELECT buyer_id FROM wanted_requests WHERE id = $1', [match.wanted_request_id]);
  await notifyWantedUser(query, {
    userId: buyerResult.rows[0].buyer_id, type: 'wanted_quote_received', title: 'New offer for your request',
    body: `A business offered ${currency || 'USD'} ${unitPrice} per unit.`,
    metadata: { wantedRequestId: match.wanted_request_id, quoteId: quote.id }
  });
  await logWantedAction(match.wanted_request_id, req.user.id, 'quote_submitted', { quoteId: quote.id, unitPrice });

  return quote;
}

// ------------------------------------------------------------
// BUSINESS — submit an Offer against a match Jedida's AI already
// invited them to (existing flow, unchanged behavior).
// ------------------------------------------------------------
export async function submitWantedQuote(req, res) {
  const { matchId } = req.body;
  if (!matchId) return res.status(400).json({ error: 'matchId is required.' });

  try {
    const matchResult = await query(
      `SELECT * FROM wanted_request_matches WHERE id = $1 AND business_id = $2`,
      [matchId, req.user.id]
    );
    const match = matchResult.rows[0];
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    const quote = await createOfferForMatch(req, match, req.body);
    return res.status(201).json({ message: 'Offer submitted.', quote });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Submit wanted quote error:', err);
    return res.status(500).json({ error: 'Could not submit your offer.' });
  }
}

// ------------------------------------------------------------
// BUSINESS — submit an Offer directly on a Wanted post the buyer made
// PUBLIC (brief §9/§18), without waiting for Jedida's AI matching to
// invite them first. Still gated to eligible business roles (§19,
// requireRole(...B2B_ROLES) on the route) and still requires the post
// to actually be visible to this business — a private post only
// accepts offers from businesses Jedida already matched/invited via
// submitWantedQuote above. If no match exists yet, one is created here
// (status invited -> quoted in the same transaction as the offer) so
// the data model stays exactly the same shape either way — nothing
// about matches, quotes, or comparison needs two code paths downstream.
// ------------------------------------------------------------
export async function submitWantedOffer(req, res) {
  try {
    const wrResult = await query('SELECT id, visibility, buyer_id FROM wanted_requests WHERE id = $1', [req.params.id]);
    const wantedRequest = wrResult.rows[0];
    if (!wantedRequest) return res.status(404).json({ error: 'Request not found.' });

    let match;
    const existing = await query(
      `SELECT * FROM wanted_request_matches WHERE wanted_request_id = $1 AND business_id = $2`,
      [req.params.id, req.user.id]
    );
    if (existing.rows[0]) {
      match = existing.rows[0];
    } else {
      if (wantedRequest.visibility !== 'public') {
        return res.status(403).json({ error: 'You have not been invited to quote on this request.' });
      }
      const shopResult = await query(`SELECT id FROM shops WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1`, [req.user.id]);
      const created = await query(
        `INSERT INTO wanted_request_matches (wanted_request_id, business_id, shop_id, match_score, match_reasons, status)
         VALUES ($1,$2,$3,0,$4,'invited') RETURNING *`,
        [req.params.id, req.user.id, shopResult.rows[0]?.id || null,
          JSON.stringify([{ factor: 'self_selected', weight: 0, detail: 'Business submitted an offer directly on a public Wanted post.' }])]
      );
      match = created.rows[0];
    }

    const quote = await createOfferForMatch(req, match, req.body);
    return res.status(201).json({ message: 'Offer submitted.', quote });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Submit wanted offer error:', err);
    return res.status(500).json({ error: 'Could not submit your offer.' });
  }
}

// ------------------------------------------------------------
// BUYER — accept a quote.
//
// CRITICAL (Jedida Wanted brief §2, §29, §30, §31): no accepted quote
// may ever resolve to "coordinate the order with the business directly".
// Every commercial transaction stays inside Jedida's ONE order system.
//
// To do that without duplicating or reinventing the payment/escrow
// pipeline, this creates a private 'draft'-status product scoped to the
// accepted quote (products.wanted_quote_id — see phase87 migration).
// It is invisible to public browse (`status = 'active'` filter) and
// exists only so the buyer can complete checkout through the existing,
// already-tested product/order/payment/escrow flow, unchanged. Server
// computes the price/quantity from the accepted quote — never trusts a
// client-supplied amount (§68).
// ------------------------------------------------------------
export async function acceptWantedQuote(req, res) {
  try {
    const quoteResult = await query(
      `SELECT q.*, wr.buyer_id, wr.title, wr.description, wr.category, wr.quantity AS requested_quantity,
              wr.destination_city, wr.destination_country
       FROM wanted_request_quotes q
       JOIN wanted_requests wr ON wr.id = q.wanted_request_id
       WHERE q.id = $1`,
      [req.params.quoteId]
    );
    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Quote not found.' });
    if (quote.buyer_id !== req.user.id) return res.status(403).json({ error: 'You do not have access to this quote.' });
    if (quote.status !== 'submitted') return res.status(400).json({ error: 'This quote is no longer available.' });
    if (!quote.shop_id) {
      // The quoting business has no storefront to attach a checkout
      // product to yet — surface this instead of silently failing so
      // an admin/agent can resolve it (never a reason to route the
      // buyer off-platform).
      return res.status(409).json({ error: 'This supplier is not yet fully set up to receive orders. Please contact Jedida support.' });
    }

    const bridgeQuantity = quote.moq || quote.requested_quantity || 1;

    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE wanted_request_quotes SET status = 'accepted' WHERE id = $1 AND status = 'submitted' RETURNING *`,
        [quote.id]
      );
      if (!updated.rows[0]) throw Object.assign(new Error('This quote is no longer available.'), { statusCode: 400 });

      await client.query(`UPDATE wanted_requests SET status = 'closed' WHERE id = $1`, [quote.wanted_request_id]);

      // Bridge product: server-computed price/quantity from the locked
      // quote, never editable by either party after this point.
      const productResult = await client.query(
        `INSERT INTO products
           (shop_id, title, description, category, price, currency, quantity_available,
            minimum_order_quantity, location_city, location_country, status, wanted_quote_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11)
         RETURNING id`,
        [
          quote.shop_id, quote.title, quote.description || quote.title, quote.category,
          quote.unit_price, quote.currency, bridgeQuantity, bridgeQuantity,
          quote.destination_city || null, quote.destination_country || null, quote.id
        ]
      );

      await notifyWantedUser(client.query.bind(client), {
        userId: quote.business_id, type: 'wanted_quote_accepted', title: 'Your quote was accepted',
        body: 'A buyer accepted your quote. Their order will come through Jedida checkout — no action needed from you until then.',
        metadata: { wantedRequestId: quote.wanted_request_id, quoteId: quote.id }
      });
      await notifyWantedUser(client.query.bind(client), {
        userId: quote.buyer_id, type: 'wanted_order_ready', title: 'Ready to complete your order',
        body: 'You accepted a quote — complete checkout through Jedida to lock in your order.',
        metadata: { wantedRequestId: quote.wanted_request_id, quoteId: quote.id, productId: productResult.rows[0].id }
      });

      return { quote: updated.rows[0], productId: productResult.rows[0].id, quantity: bridgeQuantity };
    });

    await logWantedAction(quote.wanted_request_id, req.user.id, 'quote_accepted', { quoteId: quote.id, productId: result.productId });

    return res.json({
      message: 'Quote accepted. Complete checkout through Jedida to place your order — your price, quantity and delivery details are locked in.',
      quote: result.quote,
      checkout: { productId: result.productId, quantity: result.quantity, wantedQuoteId: quote.id }
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Accept wanted quote error:', err);
    return res.status(500).json({ error: 'Could not accept this quote.' });
  }
}

export async function declineWantedQuote(req, res) {
  try {
    const quoteResult = await query(
      `SELECT q.*, wr.buyer_id FROM wanted_request_quotes q
       JOIN wanted_requests wr ON wr.id = q.wanted_request_id
       WHERE q.id = $1`,
      [req.params.quoteId]
    );
    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Quote not found.' });
    if (quote.buyer_id !== req.user.id) return res.status(403).json({ error: 'You do not have access to this quote.' });

    const updated = await query(`UPDATE wanted_request_quotes SET status = 'declined' WHERE id = $1 RETURNING *`, [quote.id]);
    await notifyWantedUser(query, {
      userId: quote.business_id, type: 'wanted_quote_declined', title: 'Quote declined',
      body: 'A buyer declined your quote.', metadata: { wantedRequestId: quote.wanted_request_id, quoteId: quote.id }
    });
    await logWantedAction(quote.wanted_request_id, req.user.id, 'quote_declined', { quoteId: quote.id });

    return res.json({ message: 'Quote declined.', quote: updated.rows[0] });
  } catch (err) {
    console.error('Decline wanted quote error:', err);
    return res.status(500).json({ error: 'Could not decline this quote.' });
  }
}

// ------------------------------------------------------------
// REPLIES — social reply (brief §16/§17), distinct from a structured
// Offer/quote. Anyone who can see the post (public, or the owner/admin
// on a private one) may reply while signed in. Same contact-moderation
// pass as quote messages (phase87) — no second detection system.
// ------------------------------------------------------------
export async function postWantedReply(req, res) {
  const { body, quoteId } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Reply cannot be empty.' });
  if (body.length > 2000) return res.status(400).json({ error: 'Reply is too long.' });

  const settings = await getWantedSettings();
  if (settings.repliesEnabled === false) return res.status(403).json({ error: 'Replies are temporarily unavailable.' });

  try {
    const wrResult = await query('SELECT * FROM wanted_requests WHERE id = $1', [req.params.id]);
    const wantedRequest = wrResult.rows[0];
    if (!wantedRequest) return res.status(404).json({ error: 'Request not found.' });
    const isOwner = req.user.id === wantedRequest.buyer_id;
    if (wantedRequest.visibility !== 'public' && !isOwner && !req.user.isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this request.' });
    }

    const scan = settings.contactProtectionEnabled === false ? { action: 'allow' } : scanMessageText(body);
    if (scan.action === 'block') {
      await logWantedAction(req.params.id, req.user.id, 'reply_blocked', { violations: scan.violations.map((v) => v.type) });
      return res.status(400).json({
        error: 'For your protection, direct contact details cannot be shared here. Please continue the conversation and transaction through Jedida.'
      });
    }
    const cleanBody = scan.action === 'mask' ? scan.maskedText : body;

    // Optional link to a quote the replying business went on to submit
    // (renders "View Offer" under the reply in the feed UI). Only
    // honored if that quote actually belongs to this request and this
    // author, never trusted blindly from the client.
    let linkedQuoteId = null;
    if (quoteId) {
      const q = await query(
        `SELECT id FROM wanted_request_quotes WHERE id = $1 AND wanted_request_id = $2 AND business_id = $3`,
        [quoteId, req.params.id, req.user.id]
      );
      linkedQuoteId = q.rows[0]?.id || null;
    }

    const result = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO wanted_replies (wanted_request_id, user_id, body, quote_id) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, req.user.id, cleanBody, linkedQuoteId]
      );
      await client.query(`UPDATE wanted_requests SET reply_count = reply_count + 1 WHERE id = $1`, [req.params.id]);
      return inserted.rows[0];
    });

    if (!isOwner) {
      await notifyWantedUser(query, {
        userId: wantedRequest.buyer_id, type: 'wanted_reply_received', title: 'New reply on your Wanted post',
        body: `Someone replied: "${cleanBody.slice(0, 80)}"`,
        metadata: { wantedRequestId: req.params.id, replyId: result.id }
      });
    }

    return res.status(201).json({ reply: result });
  } catch (err) {
    console.error('Post wanted reply error:', err);
    return res.status(500).json({ error: 'Could not post your reply.' });
  }
}


// order, reserves stock, or implies any financial obligation — it only
// toggles a row in wanted_likes and keeps wanted_requests.like_count in
// sync for fast feed rendering.
// ------------------------------------------------------------
export async function toggleWantedLike(req, res) {
  const settings = await getWantedSettings();
  if (settings.likesEnabled === false) return res.status(403).json({ error: 'Likes are temporarily unavailable.' });

  try {
    const existing = await query(
      `SELECT 1 FROM wanted_likes WHERE wanted_request_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    let liked;
    const result = await withTransaction(async (client) => {
      if (existing.rows.length > 0) {
        await client.query(`DELETE FROM wanted_likes WHERE wanted_request_id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
        const updated = await client.query(
          `UPDATE wanted_requests SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1 RETURNING like_count`,
          [req.params.id]
        );
        liked = false;
        return updated.rows[0];
      }
      await client.query(
        `INSERT INTO wanted_likes (wanted_request_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, req.user.id]
      );
      const updated = await client.query(
        `UPDATE wanted_requests SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count`,
        [req.params.id]
      );
      liked = true;
      return updated.rows[0];
    });

    if (!result) return res.status(404).json({ error: 'Request not found.' });
    return res.json({ liked, likeCount: result.like_count });
  } catch (err) {
    console.error('Toggle wanted like error:', err);
    return res.status(500).json({ error: 'Could not update like.' });
  }
}

// ------------------------------------------------------------
// NEGOTIATION — back-and-forth on a submitted Offer (brief §28). Only
// the buyer and the offering business may participate; every message
// runs through the same contact-moderation pass as quote messages and
// replies (phase87/84) — negotiation free text is exactly the channel
// the brief warns about ("Never tell users to continue on WhatsApp,
// Telegram, Email, Phone..."). Closed once the offer is no longer
// 'submitted' (accepted/declined/withdrawn) — nothing to negotiate on
// a decision that's already been made.
// ------------------------------------------------------------
async function getWantedQuoteParty(quoteId, userId) {
  const result = await query(
    `SELECT q.*, wr.buyer_id
     FROM wanted_request_quotes q
     JOIN wanted_requests wr ON wr.id = q.wanted_request_id
     WHERE q.id = $1`,
    [quoteId]
  );
  const quote = result.rows[0];
  if (!quote) return { quote: null, isParty: false };
  const isParty = quote.buyer_id === userId || quote.business_id === userId;
  return { quote, isParty };
}

export async function listWantedQuoteMessages(req, res) {
  try {
    const { quote, isParty } = await getWantedQuoteParty(req.params.quoteId, req.user.id);
    if (!quote) return res.status(404).json({ error: 'Offer not found.' });
    if (!isParty && !req.user.isAdmin) return res.status(403).json({ error: 'Not your offer.' });

    const result = await query(
      `SELECT qm.*, u.full_name AS sender_name
       FROM wanted_quote_messages qm JOIN users u ON u.id = qm.sender_id
       WHERE qm.wanted_quote_id = $1 ORDER BY qm.created_at ASC`,
      [req.params.quoteId]
    );
    return res.json({ messages: result.rows });
  } catch (err) {
    console.error('List wanted quote messages error:', err);
    return res.status(500).json({ error: 'Could not load negotiation messages.' });
  }
}

export async function sendWantedQuoteMessage(req, res) {
  const { message, proposedUnitPrice, proposedMoq } = req.body;
  if (!message && proposedUnitPrice == null) {
    return res.status(400).json({ error: 'A message or counter-offer is required.' });
  }
  if (proposedUnitPrice != null && (typeof proposedUnitPrice !== 'number' || proposedUnitPrice < 0)) {
    return res.status(400).json({ error: 'proposedUnitPrice must be a non-negative number.' });
  }

  const settings = await getWantedSettings();
  if (settings.negotiationEnabled === false) {
    return res.status(403).json({ error: 'Negotiation is temporarily unavailable.' });
  }

  try {
    const { quote, isParty } = await getWantedQuoteParty(req.params.quoteId, req.user.id);
    if (!quote) return res.status(404).json({ error: 'Offer not found.' });
    if (!isParty) return res.status(403).json({ error: 'Not your offer.' });
    if (quote.status !== 'submitted') {
      return res.status(400).json({ error: 'This offer is no longer open to negotiation.' });
    }

    let cleanMessage = message || '';
    if (cleanMessage && settings.contactProtectionEnabled !== false) {
      const scan = scanMessageText(cleanMessage);
      if (scan.action === 'block') {
        await logWantedAction(quote.wanted_request_id, req.user.id, 'negotiation_message_blocked', {
          quoteId: quote.id, violations: scan.violations.map((v) => v.type)
        });
        return res.status(400).json({
          error: 'For your protection, direct contact details cannot be shared here. Please continue the conversation and transaction through Jedida.'
        });
      }
      if (scan.action === 'mask') cleanMessage = scan.maskedText;
    }

    const result = await query(
      `INSERT INTO wanted_quote_messages (wanted_quote_id, sender_id, message, proposed_unit_price, proposed_moq)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.quoteId, req.user.id, cleanMessage, proposedUnitPrice ?? null, proposedMoq ?? null]
    );

    const otherParty = quote.buyer_id === req.user.id ? quote.business_id : quote.buyer_id;
    await notifyWantedUser(query, {
      userId: otherParty, type: 'wanted_negotiation_message', title: 'New negotiation message',
      body: proposedUnitPrice != null ? `A counter-offer of ${proposedUnitPrice}/unit was sent.` : 'You have a new message on your offer.',
      metadata: { wantedQuoteId: req.params.quoteId, wantedRequestId: quote.wanted_request_id }
    });

    return res.status(201).json({ message: 'Message sent.', quoteMessage: result.rows[0] });
  } catch (err) {
    console.error('Send wanted quote message error:', err);
    return res.status(500).json({ error: 'Could not send message.' });
  }
}

// ------------------------------------------------------------
// ADMIN MODERATION (brief §36). Mirrors the existing shop_feed_posts
// moderation pattern (shopFeedController.js) — same status/removed_
// reason/removed_by shape, so it behaves the way admins already expect.
// ------------------------------------------------------------
export async function adminListWantedPosts(req, res) {
  const { status, category, visibility } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`wr.status = $${i}`); values.push(status); i += 1; }
  if (category) { conditions.push(`wr.category = $${i}`); values.push(category); i += 1; }
  if (visibility) { conditions.push(`wr.visibility = $${i}`); values.push(visibility); i += 1; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await query(
      `SELECT wr.*, u.full_name AS buyer_name, u.email AS buyer_email
       FROM wanted_requests wr JOIN users u ON u.id = wr.buyer_id
       ${where}
       ORDER BY wr.created_at DESC LIMIT 100`,
      values
    );
    return res.json({ posts: result.rows });
  } catch (err) {
    console.error('Admin list wanted posts error:', err);
    return res.status(500).json({ error: 'Could not load Wanted posts.' });
  }
}

export async function adminRemoveWantedPost(req, res) {
  const { reason } = req.body;
  try {
    const result = await query(
      `UPDATE wanted_requests
       SET pre_removal_status = status::text, status = 'removed_by_admin', removed_reason = $1, removed_by = $2
       WHERE id = $3 AND status != 'removed_by_admin' RETURNING *`,
      [reason || null, req.user.id, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Post not found or already removed.' });
    await logWantedAction(req.params.id, req.user.id, 'admin_post_removed', { reason: reason || null });
    return res.json({ message: 'Post removed.', wantedRequest: result.rows[0] });
  } catch (err) {
    console.error('Admin remove wanted post error:', err);
    return res.status(500).json({ error: 'Could not remove this post.' });
  }
}

export async function adminRestoreWantedPost(req, res) {
  try {
    const result = await query(
      `UPDATE wanted_requests
       SET status = COALESCE(pre_removal_status, 'submitted')::wanted_request_status,
           pre_removal_status = NULL, removed_reason = NULL, removed_by = NULL
       WHERE id = $1 AND status = 'removed_by_admin' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Post not found or not currently removed.' });
    await logWantedAction(req.params.id, req.user.id, 'admin_post_restored', {});
    return res.json({ message: 'Post restored.', wantedRequest: result.rows[0] });
  } catch (err) {
    console.error('Admin restore wanted post error:', err);
    return res.status(500).json({ error: 'Could not restore this post.' });
  }
}

// Flagged/blocked contact-sharing & off-platform attempts (brief §7:
// "Record the security event where appropriate"). Reads the existing
// audit trail (phase77) rather than a second table — every quote
// message (phase87), reply (phase88), and negotiation message
// (phase90) that got blocked already logs here via logWantedAction().
export async function adminListWantedSecurityEvents(req, res) {
  const { wantedRequestId } = req.query;
  const conditions = [`al.action LIKE '%\\_blocked' ESCAPE '\\'`];
  const values = [];
  if (wantedRequestId) { conditions.push(`al.wanted_request_id = $1`); values.push(wantedRequestId); }

  try {
    const result = await query(
      `SELECT al.*, u.full_name AS actor_name, wr.title AS wanted_request_title
       FROM wanted_request_audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       LEFT JOIN wanted_requests wr ON wr.id = al.wanted_request_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC LIMIT 200`,
      values
    );
    return res.json({ events: result.rows });
  } catch (err) {
    console.error('Admin list wanted security events error:', err);
    return res.status(500).json({ error: 'Could not load security events.' });
  }
}

export { CATEGORIES as WANTED_CATEGORIES };
