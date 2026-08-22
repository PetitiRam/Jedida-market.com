import { query, withTransaction } from '../config/db.js';
import { askLLMForJson, isLLMConfigured } from '../services/llmClient.js';
import { B2B_ROLES } from './b2bCatalogController.js';

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
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, metadata)
         VALUES ($1, 'wanted_request_matched', 'New sourcing request for you', $2, $3)`,
        [m.business_id, `A buyer is looking for products in your category — respond with a quote.`, JSON.stringify({ wantedRequestId })]
      );
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
    sampleRequired, customizationRequired, attachmentUrls, categoryOverride
  } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required.' });
  }
  if (quantity !== undefined && quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) {
    return res.status(400).json({ error: 'quantity must be a whole number greater than 0.' });
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
            shipping_preference, sample_required, customization_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING *`,
        [
          req.user.id, title, description, classification.category, classification.source, classification.confidence,
          quantity || null, unit || null, budgetMin || null, budgetMax || null, currency || 'USD',
          destinationCountry || null, destinationCity || null, requiredByDate || null,
          specifications || null, qualityRequirements || null, preferredSupplierCountry || null,
          shippingPreference || null, Boolean(sampleRequired), Boolean(customizationRequired)
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
              (SELECT COUNT(*) FROM wanted_request_quotes q WHERE q.wanted_request_id = wr.id) AS live_quote_count
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

export async function getWantedRequest(req, res) {
  try {
    const wrResult = await query('SELECT * FROM wanted_requests WHERE id = $1', [req.params.id]);
    const wantedRequest = wrResult.rows[0];
    if (!wantedRequest) return res.status(404).json({ error: 'Request not found.' });
    if (wantedRequest.buyer_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this request.' });
    }

    const [matches, quotes, attachments] = await Promise.all([
      query(
        `SELECT m.*, s.name AS shop_name, s.slug AS shop_slug, u.full_name AS business_name
         FROM wanted_request_matches m
         JOIN users u ON u.id = m.business_id
         LEFT JOIN shops s ON s.id = m.shop_id
         WHERE m.wanted_request_id = $1 ORDER BY m.match_score DESC`,
        [req.params.id]
      ),
      query(
        `SELECT q.*, s.name AS shop_name, u.full_name AS business_name
         FROM wanted_request_quotes q
         JOIN users u ON u.id = q.business_id
         LEFT JOIN shops s ON s.id = q.shop_id
         WHERE q.wanted_request_id = $1 ORDER BY q.unit_price ASC`,
        [req.params.id]
      ),
      query('SELECT * FROM wanted_request_attachments WHERE wanted_request_id = $1', [req.params.id])
    ]);

    return res.json({ wantedRequest, matches: matches.rows, quotes: quotes.rows, attachments: attachments.rows });
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
              wr.destination_city, wr.required_by_date, wr.status AS request_status
       FROM wanted_request_matches m
       JOIN wanted_requests wr ON wr.id = m.wanted_request_id
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

export async function submitWantedQuote(req, res) {
  const { matchId, unitPrice, currency, moq, leadTimeDays, message } = req.body;
  if (!matchId || unitPrice === undefined || unitPrice === null) {
    return res.status(400).json({ error: 'matchId and unitPrice are required.' });
  }
  if (typeof unitPrice !== 'number' || unitPrice < 0) {
    return res.status(400).json({ error: 'unitPrice must be a non-negative number.' });
  }

  try {
    const matchResult = await query(
      `SELECT * FROM wanted_request_matches WHERE id = $1 AND business_id = $2`,
      [matchId, req.user.id]
    );
    const match = matchResult.rows[0];
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    const quote = await withTransaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO wanted_request_quotes
           (wanted_request_id, match_id, business_id, shop_id, unit_price, currency, moq, lead_time_days, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [match.wanted_request_id, matchId, req.user.id, match.shop_id, unitPrice, currency || 'USD', moq || null, leadTimeDays || null, message || null]
      );
      await client.query(`UPDATE wanted_request_matches SET status = 'quoted', responded_at = now() WHERE id = $1`, [matchId]);
      await client.query(
        `UPDATE wanted_requests SET status = 'quoted', quote_count = quote_count + 1 WHERE id = $1`,
        [match.wanted_request_id]
      );
      return insertResult.rows[0];
    });

    const buyerResult = await query('SELECT buyer_id FROM wanted_requests WHERE id = $1', [match.wanted_request_id]);
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, 'wanted_quote_received', 'New quote for your request', $2, $3)`,
      [buyerResult.rows[0].buyer_id, `A business quoted ${currency || 'USD'} ${unitPrice} per unit.`, JSON.stringify({ wantedRequestId: match.wanted_request_id, quoteId: quote.id })]
    );

    await logWantedAction(match.wanted_request_id, req.user.id, 'quote_submitted', { quoteId: quote.id, unitPrice });

    return res.status(201).json({ message: 'Quote submitted.', quote });
  } catch (err) {
    console.error('Submit wanted quote error:', err);
    return res.status(500).json({ error: 'Could not submit your quote.' });
  }
}

// ------------------------------------------------------------
// BUYER — accept/decline a quote. No fund movement or purchase-order
// creation happens here — this only records the buyer's decision and
// notifies both sides. Wiring this into an actual order/escrow flow is
// a Trade Case / Purchase Order integration point for a later phase and
// is deliberately not fabricated here.
// ------------------------------------------------------------
export async function acceptWantedQuote(req, res) {
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
    if (quote.status !== 'submitted') return res.status(400).json({ error: 'This quote is no longer available.' });

    const updated = await query(
      `UPDATE wanted_request_quotes SET status = 'accepted' WHERE id = $1 RETURNING *`,
      [quote.id]
    );
    await query(`UPDATE wanted_requests SET status = 'closed' WHERE id = $1`, [quote.wanted_request_id]);
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, 'wanted_quote_accepted', 'Your quote was accepted', $2, $3)`,
      [quote.business_id, 'A buyer accepted your quote — reach out to arrange the order.', JSON.stringify({ wantedRequestId: quote.wanted_request_id, quoteId: quote.id })]
    );
    await logWantedAction(quote.wanted_request_id, req.user.id, 'quote_accepted', { quoteId: quote.id });

    return res.json({ message: 'Quote accepted. Coordinate the order details with the business directly.', quote: updated.rows[0] });
  } catch (err) {
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
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, 'wanted_quote_declined', 'Quote declined', $2, $3)`,
      [quote.business_id, 'A buyer declined your quote.', JSON.stringify({ wantedRequestId: quote.wanted_request_id, quoteId: quote.id })]
    );
    await logWantedAction(quote.wanted_request_id, req.user.id, 'quote_declined', { quoteId: quote.id });

    return res.json({ message: 'Quote declined.', quote: updated.rows[0] });
  } catch (err) {
    console.error('Decline wanted quote error:', err);
    return res.status(500).json({ error: 'Could not decline this quote.' });
  }
}

export { CATEGORIES as WANTED_CATEGORIES };
