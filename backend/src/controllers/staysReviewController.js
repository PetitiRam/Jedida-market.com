import { query, withTransaction } from '../config/db.js';
import { recomputePropertyTrust, recomputeHostTrust, PROPERTY_MANUAL_BADGES, HOST_MANUAL_FIELDS } from '../services/staysTrustService.js';

async function notifyUser(client, userId, type, title, body, metadata = {}) {
  const runner = client || { query };
  await runner.query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

const CATEGORIES = ['cleanliness', 'comfort', 'location', 'communication', 'value', 'amenities'];

// GET /api/stays/properties/:id/reviews — public
export async function listPropertyReviews(req, res) {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT r.*, u.full_name AS guest_display_name
       FROM stays_reviews r JOIN users u ON u.id = r.guest_id
       WHERE r.property_id = $1 ORDER BY r.created_at DESC`,
      [id]
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    console.error('listPropertyReviews error:', err);
    res.status(500).json({ error: 'Could not load reviews.' });
  }
}

// GET /api/stays/host/reviews — host's own reviews across all properties
export async function listHostReviews(req, res) {
  try {
    const result = await query(
      `SELECT r.*, p.title AS property_title, u.full_name AS guest_display_name
       FROM stays_reviews r JOIN stays_properties p ON p.id = r.property_id JOIN users u ON u.id = r.guest_id
       WHERE r.host_id = $1 ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    console.error('listHostReviews error:', err);
    res.status(500).json({ error: 'Could not load your reviews.' });
  }
}

// GET /api/stays/bookings/:id/review-eligibility — guest checks before showing the form
export async function getReviewEligibility(req, res) {
  const { id } = req.params;
  try {
    const bookingResult = await query(`SELECT id, guest_id, status FROM stays_bookings WHERE id = $1`, [id]);
    const booking = bookingResult.rows[0];
    if (!booking || booking.guest_id !== req.user.id) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.status !== 'completed') return res.json({ eligible: false, reason: 'This stay is not completed yet.' });
    const existing = await query(`SELECT id FROM stays_reviews WHERE booking_id = $1`, [id]);
    if (existing.rows.length > 0) return res.json({ eligible: false, reason: 'You already reviewed this stay.' });
    res.json({ eligible: true });
  } catch (err) {
    console.error('getReviewEligibility error:', err);
    res.status(500).json({ error: 'Could not check review eligibility.' });
  }
}

// POST /api/stays/bookings/:id/review  { cleanliness, comfort, location, communication, value, amenities, comment }
export async function createReview(req, res) {
  const { id: bookingId } = req.params;
  const body = req.body || {};
  for (const cat of CATEGORIES) {
    const v = Number(body[cat]);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return res.status(400).json({ error: `${cat} rating must be an integer from 1 to 5.` });
    }
  }

  try {
    const review = await withTransaction(async (client) => {
      const bookingResult = await client.query(`SELECT * FROM stays_bookings WHERE id = $1 FOR UPDATE`, [bookingId]);
      const booking = bookingResult.rows[0];
      if (!booking) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
      if (booking.guest_id !== req.user.id) { const err = new Error('FORBIDDEN'); err.code = 'FORBIDDEN'; throw err; }
      if (booking.status !== 'completed') { const err = new Error('NOT_COMPLETED'); err.code = 'NOT_COMPLETED'; throw err; }

      const overall = Math.round((CATEGORIES.reduce((sum, c) => sum + Number(body[c]), 0) / CATEGORIES.length) * 100) / 100;

      const result = await client.query(
        `INSERT INTO stays_reviews
           (booking_id, property_id, guest_id, host_id, cleanliness, comfort, location, communication, value, amenities, overall_rating, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [bookingId, booking.property_id, booking.guest_id, booking.host_id,
         body.cleanliness, body.comfort, body.location, body.communication, body.value, body.amenities,
         overall, body.comment || null]
      );

      await recomputePropertyTrust(client, booking.property_id);
      await recomputeHostTrust(client, booking.host_id);

      const propResult = await client.query(`SELECT title FROM stays_properties WHERE id = $1`, [booking.property_id]);
      await notifyUser(client, booking.host_id, 'stays_review_received', 'New review received',
        `You received a ${overall}/5 review for "${propResult.rows[0]?.title}".`, { bookingId, propertyId: booking.property_id });

      return result.rows[0];
    });

    res.status(201).json({ message: 'Review submitted. Thank you!', review });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found.' });
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: 'This is not your booking.' });
    if (err.code === 'NOT_COMPLETED') return res.status(400).json({ error: 'You can only review a stay after it is completed.' });
    if (err.code === '23505') return res.status(409).json({ error: 'You already reviewed this stay.' });
    console.error('createReview error:', err);
    res.status(500).json({ error: 'Could not submit review.' });
  }
}

// PATCH /api/stays/reviews/:id/reply  { reply } — host only
export async function replyToReview(req, res) {
  const { id } = req.params;
  const { reply } = req.body || {};
  if (!reply || !reply.trim()) return res.status(400).json({ error: 'A reply message is required.' });

  try {
    const result = await withTransaction(async (client) => {
      const reviewResult = await client.query(`SELECT * FROM stays_reviews WHERE id = $1`, [id]);
      const review = reviewResult.rows[0];
      if (!review) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
      if (review.host_id !== req.user.id && !req.user.isAdmin) { const err = new Error('FORBIDDEN'); err.code = 'FORBIDDEN'; throw err; }

      const updated = await client.query(
        `UPDATE stays_reviews SET host_reply = $1, host_replied_at = now() WHERE id = $2 RETURNING *`,
        [reply.trim(), id]
      );
      await notifyUser(client, review.guest_id, 'stays_review_reply', 'The host replied to your review',
        `Your review received a reply.`, { reviewId: id });
      return updated.rows[0];
    });
    res.json({ message: 'Reply posted.', review: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Review not found.' });
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: 'Only the host can reply to this review.' });
    console.error('replyToReview error:', err);
    res.status(500).json({ error: 'Could not post reply.' });
  }
}

// ============================================================
// TRUST BADGES — public read, admin-manual toggles.
// Full Trust & Safety moderation tooling is Phase F (Property
// Operations Division); this is the badge data + toggle only.
// ============================================================

// GET /api/stays/hosts/:userId/trust — public
export async function getHostTrust(req, res) {
  const { userId } = req.params;
  try {
    const result = await query(`SELECT user_id, avg_rating, reviews_count, trust_badges FROM stays_host_profiles WHERE user_id = $1`, [userId]);
    res.json({ profile: result.rows[0] || { user_id: userId, avg_rating: null, reviews_count: 0, trust_badges: ['verified_host'] } });
  } catch (err) {
    console.error('getHostTrust error:', err);
    res.status(500).json({ error: 'Could not load host trust profile.' });
  }
}

// PATCH /api/stays/admin/properties/:id/badges  { badge: 'luxury_stay'|'family_friendly', enabled }
export async function adminSetPropertyBadge(req, res) {
  const { id } = req.params;
  const { badge, enabled } = req.body || {};
  if (!PROPERTY_MANUAL_BADGES.includes(badge)) {
    return res.status(400).json({ error: `badge must be one of: ${PROPERTY_MANUAL_BADGES.join(', ')}` });
  }
  try {
    const result = await withTransaction(async (client) => {
      const propResult = await client.query(`SELECT manual_badges FROM stays_properties WHERE id = $1 FOR UPDATE`, [id]);
      if (propResult.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
      const current = new Set(propResult.rows[0].manual_badges || []);
      if (enabled) current.add(badge); else current.delete(badge);
      await client.query(`UPDATE stays_properties SET manual_badges = $1 WHERE id = $2`, [JSON.stringify([...current]), id]);
      await recomputePropertyTrust(client, id);
      const updated = await client.query(`SELECT id, trust_badges FROM stays_properties WHERE id = $1`, [id]);
      return updated.rows[0];
    });
    res.json({ message: 'Badge updated.', property: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Property not found.' });
    console.error('adminSetPropertyBadge error:', err);
    res.status(500).json({ error: 'Could not update badge.' });
  }
}

// PATCH /api/stays/admin/hosts/:userId/badges  { badge: 'premium_host'|'super_responsive', enabled }
export async function adminSetHostBadge(req, res) {
  const { userId } = req.params;
  const { badge, enabled } = req.body || {};
  const column = HOST_MANUAL_FIELDS[badge];
  if (!column) return res.status(400).json({ error: `badge must be one of: ${Object.keys(HOST_MANUAL_FIELDS).join(', ')}` });

  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO stays_host_profiles (user_id, ${column}) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET ${column} = $2`,
        [userId, !!enabled]
      );
      await recomputeHostTrust(client, userId);
    });
    const result = await query(`SELECT user_id, trust_badges FROM stays_host_profiles WHERE user_id = $1`, [userId]);
    res.json({ message: 'Badge updated.', profile: result.rows[0] });
  } catch (err) {
    console.error('adminSetHostBadge error:', err);
    res.status(500).json({ error: 'Could not update badge.' });
  }
}
