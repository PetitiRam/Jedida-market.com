import { query } from '../config/db.js';

// Owner-type -> whether a business_profiles row is expected. Individuals
// list with no company record at all (same treatment as a plain seller);
// everyone else CAN attach one via business_profile_id but it isn't
// enforced here — Phase F's Property Operations verification is where
// that gets required before a listing can go live for those owner types.
export const INDIVIDUAL_OWNER_TYPES = ['individual'];

async function notifyUser(userId, type, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

async function getOwnedProperty(propertyId, ownerId) {
  const result = await query(
    `SELECT * FROM stays_properties WHERE id = $1 AND owner_id = $2`,
    [propertyId, ownerId]
  );
  return result.rows[0] || null;
}

function isOwnerOrAdmin(req, property) {
  return req.user.isAdmin || property.owner_id === req.user.id;
}

// ============================================================
// PUBLIC BROWSE / SEARCH
// ============================================================

// GET /api/stays/properties — public search. Only 'active' listings.
// Filters: property_type, city, country, guests, min_price, max_price,
// bedrooms, q (title/description search), page, limit.
export async function searchProperties(req, res) {
  const {
    property_type, city, country, guests, min_price, max_price,
    bedrooms, q, page = 1, limit = 20,
  } = req.query;

  const clauses = [`p.status = 'active'`];
  const params = [];

  function addClause(sql, value) {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  }

  if (property_type) addClause('p.property_type = ?', property_type);
  if (city) addClause('p.city ILIKE ?', `%${city}%`);
  if (country) addClause('p.country ILIKE ?', `%${country}%`);
  if (guests) addClause('p.max_guests >= ?', Number(guests));
  if (bedrooms) addClause('p.bedrooms >= ?', Number(bedrooms));
  if (min_price) addClause('p.base_price >= ?', Number(min_price));
  if (max_price) addClause('p.base_price <= ?', Number(max_price));
  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    clauses.push(`(p.title ILIKE $${idx} OR p.description ILIKE $${idx})`);
  }

  const pageSize = Math.min(Number(limit) || 20, 50);
  const offset = (Math.max(Number(page), 1) - 1) * pageSize;

  const sql = `
    SELECT p.id, p.title, p.property_type, p.owner_type, p.city, p.country,
           p.max_guests, p.bedrooms, p.bathrooms, p.base_price, p.currency,
           p.is_featured, p.views_count, p.bookings_count, p.avg_rating, p.reviews_count, p.trust_badges,
           (SELECT url FROM stays_property_media m WHERE m.property_id = p.id AND m.is_cover LIMIT 1) AS cover_image
    FROM stays_properties p
    WHERE ${clauses.join(' AND ')}
    ORDER BY p.is_featured DESC, p.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  try {
    const result = await query(sql, params);
    res.json({ properties: result.rows, page: Number(page), limit: pageSize });
  } catch (err) {
    console.error('searchProperties error:', err);
    res.status(500).json({ error: 'Could not search properties.' });
  }
}

// GET /api/stays/properties/:id — public detail view.
export async function getPropertyDetail(req, res) {
  const { id } = req.params;
  try {
    const propResult = await query(
      `SELECT p.*,
              (SELECT company_name FROM business_profiles bp WHERE bp.id = p.business_profile_id) AS company_name
       FROM stays_properties p WHERE p.id = $1`,
      [id]
    );
    const property = propResult.rows[0];
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    // Only the owner/admin can view a non-active listing (draft/pending/rejected).
    const viewerId = req.user?.id;
    const viewerIsOwnerOrAdmin = viewerId === property.owner_id || req.user?.isAdmin;
    if (property.status !== 'active' && !viewerIsOwnerOrAdmin) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const [media, offers] = await Promise.all([
      query(`SELECT * FROM stays_property_media WHERE property_id = $1 ORDER BY is_cover DESC, sort_order ASC`, [id]),
      query(`SELECT * FROM stays_special_offers WHERE property_id = $1 AND is_active = TRUE AND end_date >= CURRENT_DATE`, [id]),
    ]);

    if (property.status === 'active' && !viewerIsOwnerOrAdmin) {
      query(`UPDATE stays_properties SET views_count = views_count + 1 WHERE id = $1`, [id]).catch(() => {});
    }

    res.json({ property, media: media.rows, offers: offers.rows });
  } catch (err) {
    console.error('getPropertyDetail error:', err);
    res.status(500).json({ error: 'Could not load property.' });
  }
}

// ============================================================
// HOST — PROPERTY CRUD
// ============================================================

const EDITABLE_FIELDS = [
  'property_type', 'title', 'description', 'highlights', 'amenities', 'house_rules',
  'max_guests', 'bedrooms', 'bathrooms', 'beds', 'kitchen_details', 'internet_mbps',
  'parking', 'accessibility_features', 'nearby_attractions', 'languages_spoken',
  'emergency_contact_name', 'emergency_contact_phone', 'address_line', 'city', 'country',
  'latitude', 'longitude', 'check_in_time', 'check_out_time', 'cancellation_policy',
  'base_price', 'currency', 'cleaning_fee', 'security_deposit', 'owner_type', 'business_profile_id',
];

const JSONB_FIELDS = new Set(['highlights', 'amenities', 'parking', 'accessibility_features', 'nearby_attractions']);

// GET /api/stays/my-properties — host's own listings, any status.
export async function myProperties(req, res) {
  try {
    const result = await query(
      `SELECT p.*,
              (SELECT url FROM stays_property_media m WHERE m.property_id = p.id AND m.is_cover LIMIT 1) AS cover_image
       FROM stays_properties p WHERE p.owner_id = $1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({ properties: result.rows });
  } catch (err) {
    console.error('myProperties error:', err);
    res.status(500).json({ error: 'Could not load your properties.' });
  }
}

// POST /api/stays/properties — create a new listing (starts as pending_review).
export async function createProperty(req, res) {
  const body = req.body || {};
  if (!body.title || !body.property_type || body.base_price == null) {
    return res.status(400).json({ error: 'title, property_type and base_price are required.' });
  }

  try {
    if (body.business_profile_id) {
      const owns = await query(
        `SELECT id FROM business_profiles WHERE id = $1 AND user_id = $2`,
        [body.business_profile_id, req.user.id]
      );
      if (owns.rows.length === 0) {
        return res.status(403).json({ error: 'That business profile does not belong to you.' });
      }
    }

    const cols = ['owner_id', 'owner_type', 'property_type', 'title'];
    const values = [req.user.id, body.owner_type || 'individual', body.property_type, body.title];

    for (const field of EDITABLE_FIELDS) {
      if (field === 'owner_type' || field === 'property_type') continue;
      if (body[field] === undefined) continue;
      cols.push(field);
      values.push(JSONB_FIELDS.has(field) ? JSON.stringify(body[field]) : body[field]);
    }
    cols.push('base_price');
    values.push(body.base_price);

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    const result = await query(
      `INSERT INTO stays_properties (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    res.status(201).json({ message: 'Property created and submitted for review.', property: result.rows[0] });
  } catch (err) {
    console.error('createProperty error:', err);
    res.status(500).json({ error: 'Could not create property.' });
  }
}

// PATCH /api/stays/properties/:id
export async function updateProperty(req, res) {
  const { id } = req.params;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property && !req.user.isAdmin) return res.status(404).json({ error: 'Property not found.' });
    const existing = property || (await query(`SELECT * FROM stays_properties WHERE id = $1`, [id])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Property not found.' });

    const body = req.body || {};
    const sets = [];
    const values = [];
    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;
      values.push(JSONB_FIELDS.has(field) ? JSON.stringify(body[field]) : body[field]);
      sets.push(`${field} = $${values.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No editable fields provided.' });

    // Any substantive edit to a live listing goes back for a quick re-review,
    // same "edits re-queue review" pattern products use.
    if (existing.status === 'active') {
      sets.push(`status = 'pending_review'`);
    }

    values.push(id);
    const result = await query(
      `UPDATE stays_properties SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    res.json({ message: 'Property updated.', property: result.rows[0] });
  } catch (err) {
    console.error('updateProperty error:', err);
    res.status(500).json({ error: 'Could not update property.' });
  }
}

// PATCH /api/stays/properties/:id/pause | /resume — host toggles visibility
// without deleting the listing.
export async function setPropertyPauseState(req, res) {
  const { id } = req.params;
  const { paused } = req.body;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    if (!['active', 'paused'].includes(property.status)) {
      return res.status(400).json({ error: 'Only an active or paused listing can be toggled this way.' });
    }
    const nextStatus = paused ? 'paused' : 'active';
    const result = await query(
      `UPDATE stays_properties SET status = $1 WHERE id = $2 RETURNING *`,
      [nextStatus, id]
    );
    res.json({ message: `Property ${nextStatus}.`, property: result.rows[0] });
  } catch (err) {
    console.error('setPropertyPauseState error:', err);
    res.status(500).json({ error: 'Could not update property status.' });
  }
}

// DELETE /api/stays/properties/:id
export async function deleteProperty(req, res) {
  const { id } = req.params;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property && !req.user.isAdmin) return res.status(404).json({ error: 'Property not found.' });
    if (property && property.bookings_count > 0) {
      return res.status(400).json({ error: 'A property with past bookings cannot be deleted. Pause it instead.' });
    }
    await query(`DELETE FROM stays_properties WHERE id = $1`, [id]);
    res.json({ message: 'Property deleted.' });
  } catch (err) {
    console.error('deleteProperty error:', err);
    res.status(500).json({ error: 'Could not delete property.' });
  }
}

// ============================================================
// MEDIA — links to files already uploaded via POST /api/uploads
// ============================================================

// POST /api/stays/properties/:id/media  { url, media_type, thumbnail_url, album, caption, is_cover }
export async function addPropertyMedia(req, res) {
  const { id } = req.params;
  const { url, media_type = 'photo', thumbnail_url, album, caption, is_cover } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required (upload the file via POST /api/uploads first).' });

  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    if (is_cover) {
      await query(`UPDATE stays_property_media SET is_cover = FALSE WHERE property_id = $1`, [id]);
    }

    const sortResult = await query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM stays_property_media WHERE property_id = $1`,
      [id]
    );

    const result = await query(
      `INSERT INTO stays_property_media (property_id, media_type, url, thumbnail_url, album, caption, is_cover, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, media_type, url, thumbnail_url || null, album || null, caption || null, !!is_cover, sortResult.rows[0].next]
    );
    res.status(201).json({ media: result.rows[0] });
  } catch (err) {
    console.error('addPropertyMedia error:', err);
    res.status(500).json({ error: 'Could not add media.' });
  }
}

// DELETE /api/stays/properties/:id/media/:mediaId
export async function deletePropertyMedia(req, res) {
  const { id, mediaId } = req.params;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    await query(`DELETE FROM stays_property_media WHERE id = $1 AND property_id = $2`, [mediaId, id]);
    res.json({ message: 'Media removed.' });
  } catch (err) {
    console.error('deletePropertyMedia error:', err);
    res.status(500).json({ error: 'Could not remove media.' });
  }
}

// PATCH /api/stays/properties/:id/media/:mediaId/cover — set as cover image
export async function setCoverMedia(req, res) {
  const { id, mediaId } = req.params;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    await query(`UPDATE stays_property_media SET is_cover = FALSE WHERE property_id = $1`, [id]);
    const result = await query(
      `UPDATE stays_property_media SET is_cover = TRUE WHERE id = $1 AND property_id = $2 RETURNING *`,
      [mediaId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Media not found.' });
    res.json({ media: result.rows[0] });
  } catch (err) {
    console.error('setCoverMedia error:', err);
    res.status(500).json({ error: 'Could not set cover image.' });
  }
}

// PATCH /api/stays/properties/:id/media/reorder  { order: [mediaId, mediaId, ...] }
export async function reorderPropertyMedia(req, res) {
  const { id } = req.params;
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of media ids.' });

  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    await Promise.all(order.map((mediaId, index) =>
      query(`UPDATE stays_property_media SET sort_order = $1 WHERE id = $2 AND property_id = $3`, [index, mediaId, id])
    ));
    res.json({ message: 'Media reordered.' });
  } catch (err) {
    console.error('reorderPropertyMedia error:', err);
    res.status(500).json({ error: 'Could not reorder media.' });
  }
}

// ============================================================
// AVAILABILITY CALENDAR
// ============================================================

// Shared by getAvailability (below) and the Phase B booking engine
// (staysBookingController.js) — one place resolves "what does each
// night of a date range cost and is it bookable", so the calendar a
// guest sees and the price a booking actually charges can never drift
// apart from each other.
export async function resolvePropertyNights(propertyId, start, end) {
  const propResult = await query(`SELECT id, base_price FROM stays_properties WHERE id = $1`, [propertyId]);
  const property = propResult.rows[0];
  if (!property) return null;

  const [overridesResult, rulesResult] = await Promise.all([
    query(
      `SELECT date, is_available, price_override, min_stay_nights FROM stays_availability
       WHERE property_id = $1 AND date BETWEEN $2 AND $3`,
      [propertyId, start, end]
    ),
    query(
      `SELECT pricing_type, start_date, end_date, days_of_week, price FROM stays_pricing_rules
       WHERE property_id = $1 AND is_active = TRUE`,
      [propertyId]
    ),
  ]);

  const overrideByDate = new Map(overridesResult.rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const rules = rulesResult.rows;

  const days = [];
  const cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor < endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const override = overrideByDate.get(dateStr);
    let price = Number(property.base_price);
    let isAvailable = true;
    let minStay = 1;

    if (override) {
      if (override.price_override != null) price = Number(override.price_override);
      isAvailable = override.is_available;
      minStay = override.min_stay_nights;
    } else {
      const dow = cursor.getDay();
      const matchingRule = rules.find((r) => {
        if (r.pricing_type === 'weekend') return (r.days_of_week || []).includes(dow);
        return r.start_date && r.end_date && dateStr >= r.start_date.toISOString().slice(0, 10) && dateStr <= r.end_date.toISOString().slice(0, 10);
      });
      if (matchingRule) price = Number(matchingRule.price);
    }

    days.push({ date: dateStr, price, is_available: isAvailable, min_stay_nights: minStay });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// GET /api/stays/properties/:id/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns explicit override rows for the range plus the resolved
// effective price/availability per day (sparse rows + pricing rules +
// base_price fallback), so the frontend calendar never has to do the
// merge itself.
export async function getAvailability(req, res) {
  const { id } = req.params;
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params (YYYY-MM-DD) are required.' });

  try {
    // getAvailability is inclusive of `end` for calendar display (a host
    // wants to see the end date itself on the grid); resolvePropertyNights
    // is exclusive of `end` (a stay of check_in..check_out doesn't include
    // the check_out night), so pad by one day here only.
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
    const days = await resolvePropertyNights(id, start, inclusiveEnd.toISOString().slice(0, 10));
    if (days === null) return res.status(404).json({ error: 'Property not found.' });
    res.json({ property_id: id, days });
  } catch (err) {
    console.error('getAvailability error:', err);
    res.status(500).json({ error: 'Could not load availability.' });
  }
}

// PUT /api/stays/properties/:id/availability  { dates: [{date, is_available, price_override, min_stay_nights, note}] }
// Bulk upsert — a host blocking a range or setting a price override
// sends however many day-rows the calendar UI collected.
export async function setAvailability(req, res) {
  const { id } = req.params;
  const { dates } = req.body || {};
  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'dates must be a non-empty array.' });
  }
  if (dates.length > 366) {
    return res.status(400).json({ error: 'Update at most one year of dates per request.' });
  }

  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    for (const d of dates) {
      if (!d.date) continue;
      await query(
        `INSERT INTO stays_availability (property_id, date, is_available, price_override, min_stay_nights, note)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (property_id, date) DO UPDATE SET
           is_available = EXCLUDED.is_available,
           price_override = EXCLUDED.price_override,
           min_stay_nights = EXCLUDED.min_stay_nights,
           note = EXCLUDED.note`,
        [id, d.date, d.is_available !== false, d.price_override ?? null, d.min_stay_nights || 1, d.note || null]
      );
    }
    res.json({ message: `${dates.length} date(s) updated.` });
  } catch (err) {
    console.error('setAvailability error:', err);
    res.status(500).json({ error: 'Could not update availability.' });
  }
}

// ============================================================
// SEASONAL / WEEKEND / HOLIDAY PRICING RULES
// ============================================================

export async function listPricingRules(req, res) {
  const { id } = req.params;
  try {
    const result = await query(`SELECT * FROM stays_pricing_rules WHERE property_id = $1 ORDER BY created_at DESC`, [id]);
    res.json({ rules: result.rows });
  } catch (err) {
    console.error('listPricingRules error:', err);
    res.status(500).json({ error: 'Could not load pricing rules.' });
  }
}

export async function createPricingRule(req, res) {
  const { id } = req.params;
  const { name, pricing_type, start_date, end_date, days_of_week, price } = req.body || {};
  if (!name || !pricing_type || price == null) {
    return res.status(400).json({ error: 'name, pricing_type and price are required.' });
  }
  if (pricing_type === 'weekend' && (!Array.isArray(days_of_week) || days_of_week.length === 0)) {
    return res.status(400).json({ error: 'weekend rules require days_of_week (0=Sun..6=Sat).' });
  }

  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    const result = await query(
      `INSERT INTO stays_pricing_rules (property_id, name, pricing_type, start_date, end_date, days_of_week, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, name, pricing_type, start_date || null, end_date || null, days_of_week || null, price]
    );
    res.status(201).json({ rule: result.rows[0] });
  } catch (err) {
    console.error('createPricingRule error:', err);
    res.status(500).json({ error: 'Could not create pricing rule.' });
  }
}

export async function updatePricingRule(req, res) {
  const { id, ruleId } = req.params;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    const fields = ['name', 'start_date', 'end_date', 'days_of_week', 'price', 'is_active'];
    const sets = [];
    const values = [];
    for (const f of fields) {
      if (req.body[f] === undefined) continue;
      values.push(req.body[f]);
      sets.push(`${f} = $${values.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update.' });
    values.push(ruleId, id);

    const result = await query(
      `UPDATE stays_pricing_rules SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND property_id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found.' });
    res.json({ rule: result.rows[0] });
  } catch (err) {
    console.error('updatePricingRule error:', err);
    res.status(500).json({ error: 'Could not update pricing rule.' });
  }
}

export async function deletePricingRule(req, res) {
  const { id, ruleId } = req.params;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    await query(`DELETE FROM stays_pricing_rules WHERE id = $1 AND property_id = $2`, [ruleId, id]);
    res.json({ message: 'Rule deleted.' });
  } catch (err) {
    console.error('deletePricingRule error:', err);
    res.status(500).json({ error: 'Could not delete pricing rule.' });
  }
}

// ============================================================
// SPECIAL OFFERS
// ============================================================

export async function listSpecialOffers(req, res) {
  const { id } = req.params;
  try {
    const result = await query(`SELECT * FROM stays_special_offers WHERE property_id = $1 ORDER BY created_at DESC`, [id]);
    res.json({ offers: result.rows });
  } catch (err) {
    console.error('listSpecialOffers error:', err);
    res.status(500).json({ error: 'Could not load offers.' });
  }
}

export async function createSpecialOffer(req, res) {
  const { id } = req.params;
  const { title, description, discount_percent, start_date, end_date } = req.body || {};
  if (!title || !discount_percent || !start_date || !end_date) {
    return res.status(400).json({ error: 'title, discount_percent, start_date and end_date are required.' });
  }

  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    const result = await query(
      `INSERT INTO stays_special_offers (property_id, title, description, discount_percent, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, title, description || null, discount_percent, start_date, end_date]
    );
    res.status(201).json({ offer: result.rows[0] });
  } catch (err) {
    console.error('createSpecialOffer error:', err);
    res.status(500).json({ error: 'Could not create offer.' });
  }
}

export async function deleteSpecialOffer(req, res) {
  const { id, offerId } = req.params;
  try {
    const property = await getOwnedProperty(id, req.user.id);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    await query(`DELETE FROM stays_special_offers WHERE id = $1 AND property_id = $2`, [offerId, id]);
    res.json({ message: 'Offer deleted.' });
  } catch (err) {
    console.error('deleteSpecialOffer error:', err);
    res.status(500).json({ error: 'Could not delete offer.' });
  }
}

// ============================================================
// ADMIN — lightweight listing review (full Property Operations
// Division with dedicated roles/queues/fraud tooling is Phase F;
// this is the same "gate it to active" step products already use).
// ============================================================

// GET /api/stays/admin/pending
export async function adminListPending(req, res) {
  try {
    const result = await query(
      `SELECT p.*, u.email AS owner_email, u.username AS owner_username
       FROM stays_properties p JOIN users u ON u.id = p.owner_id
       WHERE p.status = 'pending_review' ORDER BY p.created_at ASC`
    );
    res.json({ properties: result.rows });
  } catch (err) {
    console.error('adminListPending error:', err);
    res.status(500).json({ error: 'Could not load pending properties.' });
  }
}

// PATCH /api/stays/admin/properties/:id/review  { action: 'approve'|'reject', notes }
export async function adminReviewProperty(req, res) {
  const { id } = req.params;
  const { action, notes } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
  }

  try {
    const propResult = await query(`SELECT * FROM stays_properties WHERE id = $1`, [id]);
    const property = propResult.rows[0];
    if (!property) return res.status(404).json({ error: 'Property not found.' });

    const nextStatus = action === 'approve' ? 'active' : 'rejected';
    const result = await query(
      `UPDATE stays_properties
       SET status = $1, reviewed_by = $2, reviewed_at = now(), reviewer_notes = $3
       WHERE id = $4 RETURNING *`,
      [nextStatus, req.user.id, notes || null, id]
    );

    await notifyUser(
      property.owner_id,
      action === 'approve' ? 'stays_property_approved' : 'stays_property_rejected',
      action === 'approve' ? 'Your property is live!' : 'Your property listing needs changes',
      action === 'approve'
        ? `"${property.title}" is now live on Jedida Stays.`
        : `"${property.title}" was not approved.${notes ? ` Notes: ${notes}` : ''}`,
      { propertyId: id }
    );

    res.json({ message: `Property ${nextStatus}.`, property: result.rows[0] });
  } catch (err) {
    console.error('adminReviewProperty error:', err);
    res.status(500).json({ error: 'Could not review property.' });
  }
}
