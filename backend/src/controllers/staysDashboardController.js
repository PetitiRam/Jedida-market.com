import { query } from '../config/db.js';

// ============================================================
// SAVED PROPERTIES (guest "wishlist" for Stays — product_wishlists
// from phase17 is products-only, so this is its own small table)
// ============================================================

// POST /api/stays/saved/:propertyId/toggle
export async function toggleSavedProperty(req, res) {
  const { propertyId } = req.params;
  try {
    const existing = await query(
      `SELECT 1 FROM stays_saved_properties WHERE user_id = $1 AND property_id = $2`,
      [req.user.id, propertyId]
    );
    if (existing.rows.length > 0) {
      await query(`DELETE FROM stays_saved_properties WHERE user_id = $1 AND property_id = $2`, [req.user.id, propertyId]);
      return res.json({ saved: false });
    }
    await query(
      `INSERT INTO stays_saved_properties (user_id, property_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.user.id, propertyId]
    );
    res.json({ saved: true });
  } catch (err) {
    console.error('toggleSavedProperty error:', err);
    res.status(500).json({ error: 'Could not update saved properties.' });
  }
}

// GET /api/stays/saved
export async function listSavedProperties(req, res) {
  try {
    const result = await query(
      `SELECT p.id, p.title, p.property_type, p.city, p.country, p.base_price, p.currency, p.status,
              (SELECT url FROM stays_property_media m WHERE m.property_id = p.id AND m.is_cover LIMIT 1) AS cover_image
       FROM stays_saved_properties s JOIN stays_properties p ON p.id = s.property_id
       WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ properties: result.rows });
  } catch (err) {
    console.error('listSavedProperties error:', err);
    res.status(500).json({ error: 'Could not load saved properties.' });
  }
}

// ============================================================
// GUEST OVERVIEW
// ============================================================

// GET /api/stays/guest/overview
export async function getGuestOverview(req, res) {
  try {
    const [nextTrip, counts, savedCount] = await Promise.all([
      query(
        `SELECT b.id, b.check_in, b.check_out, p.title AS property_title, p.city,
                (SELECT url FROM stays_property_media m WHERE m.property_id = p.id AND m.is_cover LIMIT 1) AS cover_image
         FROM stays_bookings b JOIN stays_properties p ON p.id = b.property_id
         WHERE b.guest_id = $1 AND b.status = 'confirmed' AND b.check_in >= CURRENT_DATE
         ORDER BY b.check_in ASC LIMIT 1`,
        [req.user.id]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'confirmed' AND check_in >= CURRENT_DATE) AS upcoming_trips,
           COUNT(*) FILTER (WHERE status IN ('pending_payment', 'payment_submitted')) AS awaiting_payment,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed_trips
         FROM stays_bookings WHERE guest_id = $1`,
        [req.user.id]
      ),
      query(`SELECT COUNT(*) AS n FROM stays_saved_properties WHERE user_id = $1`, [req.user.id]),
    ]);

    res.json({
      nextTrip: nextTrip.rows[0] || null,
      upcomingTrips: Number(counts.rows[0].upcoming_trips),
      awaitingPayment: Number(counts.rows[0].awaiting_payment),
      completedTrips: Number(counts.rows[0].completed_trips),
      savedProperties: Number(savedCount.rows[0].n),
    });
  } catch (err) {
    console.error('getGuestOverview error:', err);
    res.status(500).json({ error: 'Could not load your Stays overview.' });
  }
}

// ============================================================
// HOST OVERVIEW
// ============================================================

// GET /api/stays/host/overview
export async function getHostOverview(req, res) {
  try {
    const [propertyCounts, upcomingCheckIns, actionNeeded, revenue] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active') AS active,
           COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_review,
           COUNT(*) FILTER (WHERE status = 'paused') AS paused
         FROM stays_properties WHERE owner_id = $1`,
        [req.user.id]
      ),
      query(
        `SELECT b.id, b.check_in, b.check_out, p.title AS property_title, u.full_name AS guest_name
         FROM stays_bookings b JOIN stays_properties p ON p.id = b.property_id JOIN users u ON u.id = b.guest_id
         WHERE b.host_id = $1 AND b.status = 'confirmed' AND b.check_in BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
         ORDER BY b.check_in ASC LIMIT 5`,
        [req.user.id]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'payment_submitted') AS pending_payment_verification,
           COUNT(*) FILTER (WHERE status = 'confirmed' AND check_out <= CURRENT_DATE) AS ready_to_complete
         FROM stays_bookings WHERE host_id = $1`,
        [req.user.id]
      ),
      query(
        `SELECT COALESCE(SUM(wt.amount), 0) AS this_month
         FROM wallet_transactions wt JOIN wallets w ON w.id = wt.wallet_id
         WHERE w.owner_id = $1 AND wt.reference_type = 'stays_booking_release' AND wt.direction = 'credit'
           AND wt.created_at >= date_trunc('month', CURRENT_DATE)`,
        [req.user.id]
      ),
    ]);

    res.json({
      properties: {
        active: Number(propertyCounts.rows[0].active),
        pendingReview: Number(propertyCounts.rows[0].pending_review),
        paused: Number(propertyCounts.rows[0].paused),
      },
      upcomingCheckIns: upcomingCheckIns.rows,
      pendingPaymentVerification: Number(actionNeeded.rows[0].pending_payment_verification),
      readyToComplete: Number(actionNeeded.rows[0].ready_to_complete),
      revenueThisMonth: Number(revenue.rows[0].this_month),
    });
  } catch (err) {
    console.error('getHostOverview error:', err);
    res.status(500).json({ error: 'Could not load your host overview.' });
  }
}
