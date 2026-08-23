import { query } from '../config/db.js';
import { getAdapterForProvider } from '../services/logisticsProviderAdapter.js';

async function notify(userId, type, title, body, metadata = {}) {
  await query(`INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]);
}

// ------------------------------------------------------------
// PROVIDER REGISTRY (admin)
// ------------------------------------------------------------
export async function adminCreateProvider(req, res) {
  const { name, providerType, integrationType, integrationConfig, countriesServed, contactEmail, contactPhone } = req.body;
  if (!name || !providerType) return res.status(400).json({ error: 'name and providerType are required.' });
  try {
    const result = await query(
      `INSERT INTO shipping_providers (name, provider_type, integration_type, integration_config, countries_served, contact_email, contact_phone, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, providerType, integrationType || 'manual', JSON.stringify(integrationConfig || {}),
        Array.isArray(countriesServed) ? countriesServed : [], contactEmail || null, contactPhone || null, req.user.id]
    );
    return res.status(201).json({ message: 'Provider added.', provider: result.rows[0] });
  } catch (err) {
    console.error('Create shipping provider error:', err);
    return res.status(500).json({ error: 'Could not add provider.' });
  }
}

export async function listProviders(req, res) {
  try {
    const { providerType, country } = req.query;
    const result = await query(
      `SELECT * FROM shipping_providers
       WHERE active = TRUE
         AND ($1::shipping_provider_type IS NULL OR provider_type = $1)
         AND ($2::text IS NULL OR $2 = ANY(countries_served))
       ORDER BY name ASC`,
      [providerType || null, country || null]
    );
    return res.json({ providers: result.rows });
  } catch (err) {
    console.error('List shipping providers error:', err);
    return res.status(500).json({ error: 'Could not load providers.' });
  }
}

export async function adminUpdateProvider(req, res) {
  const { name, active, countriesServed, contactEmail, contactPhone } = req.body;
  try {
    const result = await query(
      `UPDATE shipping_providers SET
         name = COALESCE($2, name), active = COALESCE($3, active),
         countries_served = COALESCE($4, countries_served),
         contact_email = COALESCE($5, contact_email), contact_phone = COALESCE($6, contact_phone)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name || null, typeof active === 'boolean' ? active : null,
        Array.isArray(countriesServed) ? countriesServed : null, contactEmail || null, contactPhone || null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Provider not found.' });
    return res.json({ provider: result.rows[0] });
  } catch (err) {
    console.error('Update shipping provider error:', err);
    return res.status(500).json({ error: 'Could not update provider.' });
  }
}

// ------------------------------------------------------------
// QUOTE REQUESTS + RATE COMPARISON
// ------------------------------------------------------------
export async function requestShippingQuote(req, res) {
  const { originCountry, originCity, destinationCountry, destinationCity, weightKg, dimensions, cargoDescription, wantedRequestId, orderId } = req.body;
  if (!originCountry || !destinationCountry) return res.status(400).json({ error: 'originCountry and destinationCountry are required.' });

  try {
    const result = await query(
      `INSERT INTO shipping_quotes (requested_by, origin_country, origin_city, destination_country, destination_city, weight_kg, dimensions, cargo_description, linked_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, originCountry, originCity || null, destinationCountry, destinationCity || null,
        weightKg || null, JSON.stringify(dimensions || {}), cargoDescription || null,
        JSON.stringify({ wantedRequestId: wantedRequestId || null, orderId: orderId || null })]
    );

    // Every "manual" adapter is asked in parallel — this is the one call
    // site that would also pick up any future 'api' providers without
    // changes, per the adapter architecture.
    const eligibleProviders = await query(
      `SELECT * FROM shipping_providers WHERE active = TRUE AND ($1 = ANY(countries_served) OR $2 = ANY(countries_served))`,
      [originCountry, destinationCountry]
    );
    for (const provider of eligibleProviders.rows) {
      const adapter = getAdapterForProvider(provider);
      await adapter.getQuote(); // manual providers: no-op, rates are entered by staff below
    }

    return res.status(201).json({ message: 'Quote request submitted — matched providers will respond with rates.', quote: result.rows[0], matchedProviders: eligibleProviders.rows.length });
  } catch (err) {
    console.error('Request shipping quote error:', err);
    return res.status(500).json({ error: 'Could not submit quote request.' });
  }
}

export async function myShippingQuotes(req, res) {
  try {
    const result = await query(
      `SELECT q.*,
              (SELECT COUNT(*) FROM shipping_quote_options o WHERE o.quote_id = q.id) AS option_count
       FROM shipping_quotes q WHERE q.requested_by = $1 ORDER BY q.created_at DESC`,
      [req.user.id]
    );
    return res.json({ quotes: result.rows });
  } catch (err) {
    console.error('My shipping quotes error:', err);
    return res.status(500).json({ error: 'Could not load your quotes.' });
  }
}

export async function getShippingQuoteOptions(req, res) {
  try {
    const quoteResult = await query('SELECT * FROM shipping_quotes WHERE id = $1', [req.params.id]);
    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Quote not found.' });
    if (quote.requested_by !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'You do not have access to this quote.' });

    const options = await query(
      `SELECT o.*, p.name AS provider_name, p.provider_type
       FROM shipping_quote_options o JOIN shipping_providers p ON p.id = o.provider_id
       WHERE o.quote_id = $1 ORDER BY o.price ASC`,
      [req.params.id]
    );
    return res.json({ quote, options: options.rows });
  } catch (err) {
    console.error('Get shipping quote options error:', err);
    return res.status(500).json({ error: 'Could not load this quote.' });
  }
}

// Admin/provider staff key in a rate — this is the real "getQuote" for
// every manual-integration provider today.
export async function adminSubmitQuoteOption(req, res) {
  const { quoteId, providerId, serviceType, price, currency, estimatedDays, notes } = req.body;
  if (!quoteId || !providerId || price === undefined || price === null) {
    return res.status(400).json({ error: 'quoteId, providerId, and price are required.' });
  }
  try {
    const result = await query(
      `INSERT INTO shipping_quote_options (quote_id, provider_id, service_type, price, currency, estimated_days, notes, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [quoteId, providerId, serviceType || null, price, currency || 'USD', estimatedDays || null, notes || null, req.user.id]
    );
    await query(`UPDATE shipping_quotes SET status = 'quoted' WHERE id = $1`, [quoteId]);

    const quoteResult = await query('SELECT requested_by FROM shipping_quotes WHERE id = $1', [quoteId]);
    if (quoteResult.rows[0]) {
      await notify(quoteResult.rows[0].requested_by, 'shipping_quote_ready', 'New shipping rate available', `A rate was added to your shipping quote.`, { quoteId });
    }

    return res.status(201).json({ message: 'Rate added.', option: result.rows[0] });
  } catch (err) {
    console.error('Submit quote option error:', err);
    return res.status(500).json({ error: 'Could not add this rate.' });
  }
}

// ------------------------------------------------------------
// BOOKINGS + TRACKING
// ------------------------------------------------------------
export async function createBooking(req, res) {
  const { quoteId, quoteOptionId, pickupAddress, dropoffAddress } = req.body;
  if (!quoteOptionId) return res.status(400).json({ error: 'quoteOptionId is required.' });

  try {
    const optionResult = await query(
      `SELECT o.*, p.id AS provider_id FROM shipping_quote_options o JOIN shipping_providers p ON p.id = o.provider_id WHERE o.id = $1`,
      [quoteOptionId]
    );
    const option = optionResult.rows[0];
    if (!option) return res.status(404).json({ error: 'Quote option not found.' });

    const providerResult = await query('SELECT * FROM shipping_providers WHERE id = $1', [option.provider_id]);
    const adapter = getAdapterForProvider(providerResult.rows[0]);
    await adapter.createBooking(); // manual providers: no-op, booking recorded directly below

    const result = await query(
      `INSERT INTO shipping_bookings (quote_id, quote_option_id, provider_id, booked_by, pickup_address, dropoff_address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [quoteId || option.quote_id, quoteOptionId, option.provider_id, req.user.id, pickupAddress || null, dropoffAddress || null]
    );

    if (quoteId || option.quote_id) {
      await query(`UPDATE shipping_quotes SET status = 'booked' WHERE id = $1`, [quoteId || option.quote_id]);
    }

    await query(
      `INSERT INTO shipping_tracking_events (booking_id, status, note, created_by) VALUES ($1,'booked','Booking created.',$2)`,
      [result.rows[0].id, req.user.id]
    );

    return res.status(201).json({ message: 'Booked.', booking: result.rows[0] });
  } catch (err) {
    console.error('Create shipping booking error:', err);
    return res.status(500).json({ error: 'Could not create this booking.' });
  }
}

export async function myBookings(req, res) {
  try {
    const result = await query(
      `SELECT b.*, p.name AS provider_name, p.provider_type FROM shipping_bookings b
       JOIN shipping_providers p ON p.id = b.provider_id
       WHERE b.booked_by = $1 ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    return res.json({ bookings: result.rows });
  } catch (err) {
    console.error('My shipping bookings error:', err);
    return res.status(500).json({ error: 'Could not load your bookings.' });
  }
}

export async function getBookingTracking(req, res) {
  try {
    const bookingResult = await query('SELECT * FROM shipping_bookings WHERE id = $1', [req.params.id]);
    const booking = bookingResult.rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.booked_by !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: 'You do not have access to this booking.' });

    const events = await query(`SELECT * FROM shipping_tracking_events WHERE booking_id = $1 ORDER BY created_at ASC`, [req.params.id]);
    return res.json({ booking, events: events.rows });
  } catch (err) {
    console.error('Get booking tracking error:', err);
    return res.status(500).json({ error: 'Could not load tracking for this booking.' });
  }
}

// Admin/provider staff post a status update — the real "trackShipment"
// for every manual-integration provider today.
export async function adminAddTrackingEvent(req, res) {
  const { status, note, location } = req.body;
  const validStatuses = ['booked', 'pickup_scheduled', 'picked_up', 'in_transit', 'customs', 'delivered', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }
  try {
    const bookingResult = await query('SELECT * FROM shipping_bookings WHERE id = $1', [req.params.id]);
    const booking = bookingResult.rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    await query(`UPDATE shipping_bookings SET status = $2 WHERE id = $1`, [booking.id, status]);
    const event = await query(
      `INSERT INTO shipping_tracking_events (booking_id, status, note, location, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [booking.id, status, note || null, location || null, req.user.id]
    );

    await notify(booking.booked_by, 'shipping_status_update', 'Shipment status updated', `Status: ${status}${location ? ` (${location})` : ''}.`, { bookingId: booking.id });

    return res.status(201).json({ message: 'Tracking updated.', event: event.rows[0] });
  } catch (err) {
    console.error('Add tracking event error:', err);
    return res.status(500).json({ error: 'Could not update tracking.' });
  }
}

export async function adminListBookings(req, res) {
  try {
    const { status } = req.query;
    const result = await query(
      `SELECT b.*, p.name AS provider_name FROM shipping_bookings b
       JOIN shipping_providers p ON p.id = b.provider_id
       WHERE ($1::shipping_booking_status IS NULL OR b.status = $1)
       ORDER BY b.created_at DESC LIMIT 200`,
      [status || null]
    );
    return res.json({ bookings: result.rows });
  } catch (err) {
    console.error('Admin list bookings error:', err);
    return res.status(500).json({ error: 'Could not load bookings.' });
  }
}
