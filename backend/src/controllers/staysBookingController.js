import { query, withTransaction } from '../config/db.js';
import { ADAPTERS } from '../services/paymentProviders.js';
import { resolvePropertyNights } from './staysController.js';
import { issuePassForBooking, revokePassForBooking } from './staysPassController.js';

async function logWalletTransaction(client, { walletId, direction, amount, balanceAfter, referenceType, referenceId, note, createdBy }) {
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [walletId, direction, amount, balanceAfter, referenceType, referenceId || null, note || null, createdBy || null]
  );
}

async function notifyUser(client, userId, type, title, body, metadata = {}) {
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

// Platform fee percent reused from platform_settings — same admin-configured
// rate orders use, so Stays doesn't need its own separate fee dial.
async function getPlatformFeePercent() {
  const r = await query('SELECT platform_fee_percent FROM platform_settings WHERE id = 1');
  return Number(r.rows[0]?.platform_fee_percent ?? 5);
}

function nightsBetween(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

// ============================================================
// GUEST — CREATE BOOKING (pending_payment)
// ============================================================

// POST /api/stays/properties/:id/bookings
// { check_in, check_out, guests_count, special_requests, method }
export async function createBooking(req, res) {
  const { id: propertyId } = req.params;
  const { check_in, check_out, guests_count = 1, special_requests, method } = req.body || {};

  if (!check_in || !check_out) return res.status(400).json({ error: 'check_in and check_out (YYYY-MM-DD) are required.' });
  if (!ADAPTERS[method]) return res.status(400).json({ error: 'Unsupported payment method. Use mtn_mobile_money or airtel_money.' });

  const nights = nightsBetween(check_in, check_out);
  if (nights < 1) return res.status(400).json({ error: 'check_out must be at least one night after check_in.' });
  if (new Date(check_in) < new Date(new Date().toISOString().slice(0, 10))) {
    return res.status(400).json({ error: 'check_in cannot be in the past.' });
  }

  try {
    const booking = await withTransaction(async (client) => {
      // Row-lock every date this booking would occupy so two guests racing
      // to book the same nights can't both succeed — the second one hits
      // the is_available check below once the first commits its blocks.
      const propResult = await client.query(
        `SELECT * FROM stays_properties WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [propertyId]
      );
      const property = propResult.rows[0];
      if (!property) { const err = new Error('PROPERTY_NOT_FOUND'); err.code = 'PROPERTY_NOT_FOUND'; throw err; }
      if (guests_count > property.max_guests) {
        const err = new Error('TOO_MANY_GUESTS'); err.code = 'TOO_MANY_GUESTS'; err.maxGuests = property.max_guests; throw err;
      }

      const lockResult = await client.query(
        `SELECT date, is_available FROM stays_availability
         WHERE property_id = $1 AND date >= $2 AND date < $3 FOR UPDATE`,
        [propertyId, check_in, check_out]
      );
      if (lockResult.rows.some((r) => !r.is_available)) {
        const err = new Error('DATES_UNAVAILABLE'); err.code = 'DATES_UNAVAILABLE'; throw err;
      }
      // A confirmed/pending overlapping booking is the authoritative
      // conflict check (a date can be "available" in stays_availability
      // right up until a booking claims it in the same transaction).
      const overlap = await client.query(
        `SELECT id FROM stays_bookings
         WHERE property_id = $1 AND status IN ('pending_payment', 'payment_submitted', 'confirmed')
           AND check_in < $3 AND check_out > $2 FOR UPDATE`,
        [propertyId, check_in, check_out]
      );
      if (overlap.rows.length > 0) { const err = new Error('DATES_UNAVAILABLE'); err.code = 'DATES_UNAVAILABLE'; throw err; }

      const days = await resolvePropertyNights(propertyId, check_in, check_out);
      const minStay = Math.max(...days.map((d) => d.min_stay_nights), 1);
      if (nights < minStay) { const err = new Error('MIN_STAY'); err.code = 'MIN_STAY'; err.minStay = minStay; throw err; }

      const nightlySubtotal = days.reduce((sum, d) => sum + d.price, 0);
      const cleaningFee = Number(property.cleaning_fee) || 0;

      const offerResult = await client.query(
        `SELECT * FROM stays_special_offers WHERE property_id = $1 AND is_active = TRUE
           AND start_date <= $2 AND end_date >= $2 ORDER BY discount_percent DESC LIMIT 1`,
        [propertyId, check_in]
      );
      const offer = offerResult.rows[0];
      const discountAmount = offer ? Math.round(nightlySubtotal * (offer.discount_percent / 100) * 100) / 100 : 0;

      const feePercent = await getPlatformFeePercent();
      const preFeeTotal = nightlySubtotal - discountAmount + cleaningFee;
      const feeAmount = Math.round(preFeeTotal * feePercent) / 100;
      const totalAmount = preFeeTotal + feeAmount;

      const bookingResult = await client.query(
        `INSERT INTO stays_bookings
           (property_id, guest_id, host_id, check_in, check_out, nights, guests_count, special_requests,
            nightly_subtotal, cleaning_fee, discount_amount, platform_fee_percent, platform_fee_amount, total_amount, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [propertyId, req.user.id, property.owner_id, check_in, check_out, nights, guests_count, special_requests || null,
         nightlySubtotal, cleaningFee, discountAmount, feePercent, feeAmount, totalAmount, property.currency]
      );
      const booking = bookingResult.rows[0];

      // Provisionally block these nights right away so a second guest can't
      // book them while this one is mid-payment. If payment is never
      // completed, cancelBooking (or an admin) releases the block.
      for (const day of days) {
        await client.query(
          `INSERT INTO stays_availability (property_id, date, is_available, note)
           VALUES ($1,$2,FALSE,$3)
           ON CONFLICT (property_id, date) DO UPDATE SET is_available = FALSE, note = EXCLUDED.note`,
          [propertyId, day.date, `Held for booking ${booking.id}`]
        );
      }

      await notifyUser(client, property.owner_id, 'stays_booking_requested', 'New booking request',
        `A guest requested ${nights} night(s) at "${property.title}". Awaiting payment.`, { bookingId: booking.id });

      return booking;
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const charge = await ADAPTERS[method]({
      amount: booking.total_amount, currency: booking.currency, orderId: booking.id,
      returnUrl: `${frontendUrl}/guest/bookings/${booking.id}`,
    });

    await query(
      `INSERT INTO stays_booking_payments (booking_id, method, amount, currency, status, provider_reference, raw_response)
       VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
      [booking.id, method, booking.total_amount, booking.currency, charge.providerReference, charge.raw]
    );

    res.status(201).json({
      message: 'Booking created. Complete payment to confirm your stay.',
      booking, providerReference: charge.providerReference, paymentInstructions: charge.raw,
    });
  } catch (err) {
    if (err.code === 'PROPERTY_NOT_FOUND') return res.status(404).json({ error: 'Property not found or not currently bookable.' });
    if (err.code === 'TOO_MANY_GUESTS') return res.status(400).json({ error: `This property sleeps up to ${err.maxGuests} guests.` });
    if (err.code === 'DATES_UNAVAILABLE') return res.status(409).json({ error: 'Those dates are no longer available.' });
    if (err.code === 'MIN_STAY') return res.status(400).json({ error: `This property requires a minimum stay of ${err.minStay} night(s) for these dates.` });
    console.error('createBooking error:', err);
    res.status(500).json({ error: 'Could not create booking.' });
  }
}

// POST /api/stays/bookings/:id/submit-payment  { phoneNumber, transactionReference, proofImage }
export async function submitBookingPayment(req, res) {
  const { id } = req.params;
  const { phoneNumber, transactionReference, proofImage } = req.body || {};
  if (!transactionReference || !proofImage) {
    return res.status(400).json({ error: 'A transaction reference and proof image are required.' });
  }

  try {
    const result = await query(
      `UPDATE stays_booking_payments p SET status = 'submitted', payer_phone = $1, transaction_reference = $2, proof_image = $3
       FROM stays_bookings b
       WHERE p.booking_id = b.id AND b.id = $4 AND b.guest_id = $5 AND p.status = 'initiated'
       RETURNING p.*`,
      [phoneNumber || null, transactionReference, proofImage, id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No pending payment found for this booking, or it has already been submitted.' });
    }
    await query(`UPDATE stays_bookings SET status = 'payment_submitted' WHERE id = $1 AND status = 'pending_payment'`, [id]);
    res.json({ message: 'Payment submitted for admin verification.', payment: result.rows[0] });
  } catch (err) {
    console.error('submitBookingPayment error:', err);
    res.status(500).json({ error: 'Could not submit payment.' });
  }
}

// ============================================================
// GUEST / HOST — LISTS + CANCELLATION
// ============================================================

export async function myBookingsAsGuest(req, res) {
  try {
    const result = await query(
      `SELECT b.*, p.title AS property_title, p.city, p.country,
              (SELECT url FROM stays_property_media m WHERE m.property_id = p.id AND m.is_cover LIMIT 1) AS cover_image
       FROM stays_bookings b JOIN stays_properties p ON p.id = b.property_id
       WHERE b.guest_id = $1 ORDER BY b.check_in DESC`,
      [req.user.id]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error('myBookingsAsGuest error:', err);
    res.status(500).json({ error: 'Could not load your bookings.' });
  }
}

export async function myBookingsAsHost(req, res) {
  try {
    const result = await query(
      `SELECT b.*, p.title AS property_title, u.username AS guest_username, u.email AS guest_email
       FROM stays_bookings b JOIN stays_properties p ON p.id = b.property_id JOIN users u ON u.id = b.guest_id
       WHERE b.host_id = $1 ORDER BY b.check_in DESC`,
      [req.user.id]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error('myBookingsAsHost error:', err);
    res.status(500).json({ error: 'Could not load your bookings.' });
  }
}

async function releaseBookingDates(client, bookingId) {
  // Only clear the block if the note is still the one this booking wrote —
  // a host's own manual block on the same dates (or a later booking that
  // reused a date, which shouldn't happen, but defensively) is left alone.
  await client.query(
    `UPDATE stays_availability SET is_available = TRUE, note = NULL
     WHERE note = $1`,
    [`Held for booking ${bookingId}`]
  );
}

// PATCH /api/stays/bookings/:id/cancel  { reason }
// Guest can cancel before check-in; host/admin can also cancel (e.g. a
// property becoming unavailable). A confirmed booking that's cancelled
// gets refunded from escrow back to the guest's wallet.
export async function cancelBooking(req, res) {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const result = await withTransaction(async (client) => {
      const bookingResult = await client.query(`SELECT * FROM stays_bookings WHERE id = $1 FOR UPDATE`, [id]);
      const booking = bookingResult.rows[0];
      if (!booking) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }

      const isGuest = booking.guest_id === req.user.id;
      const isHost = booking.host_id === req.user.id;
      if (!isGuest && !isHost && !req.user.isAdmin) { const err = new Error('FORBIDDEN'); err.code = 'FORBIDDEN'; throw err; }

      if (!['pending_payment', 'payment_submitted', 'confirmed'].includes(booking.status)) {
        const err = new Error('NOT_CANCELLABLE'); err.code = 'NOT_CANCELLABLE'; throw err;
      }
      if (isGuest && new Date(booking.check_in) <= new Date(new Date().toISOString().slice(0, 10))) {
        const err = new Error('TOO_LATE'); err.code = 'TOO_LATE'; throw err;
      }

      let refunded = false;
      if (booking.status === 'confirmed') {
        // Confirmed means escrow already holds total_amount — refund it to
        // the guest's wallet rather than just cancelling the record.
        const escrowWallet = await client.query(
          `UPDATE wallets SET balance = balance - $1 WHERE type = 'escrow' AND balance >= $1 RETURNING *`,
          [booking.total_amount]
        );
        if (escrowWallet.rows.length === 0) { const err = new Error('ESCROW_INSUFFICIENT'); err.code = 'ESCROW_INSUFFICIENT'; throw err; }
        await logWalletTransaction(client, {
          walletId: escrowWallet.rows[0].id, direction: 'debit', amount: booking.total_amount, balanceAfter: escrowWallet.rows[0].balance,
          referenceType: 'stays_booking_refund', referenceId: booking.id, note: reason || 'Booking cancelled', createdBy: req.user.id,
        });
        const guestWallet = await client.query(`UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2 AND type = 'user' RETURNING *`, [booking.total_amount, booking.guest_id]);
        await logWalletTransaction(client, {
          walletId: guestWallet.rows[0].id, direction: 'credit', amount: booking.total_amount, balanceAfter: guestWallet.rows[0].balance,
          referenceType: 'stays_booking_refund', referenceId: booking.id, note: 'Booking cancellation refund', createdBy: req.user.id,
        });
        refunded = true;
      }

      const nextStatus = refunded ? 'refunded' : 'cancelled';
      const updated = await client.query(
        `UPDATE stays_bookings SET status = $1, cancellation_reason = $2, cancelled_by = $3 WHERE id = $4 RETURNING *`,
        [nextStatus, reason || null, req.user.id, id]
      );

      await releaseBookingDates(client, booking.id);
      if (refunded) await revokePassForBooking(client, booking.id, reason || 'Booking cancelled');

      await notifyUser(client, isGuest ? booking.host_id : booking.guest_id, 'stays_booking_cancelled', 'Booking cancelled',
        `The booking for ${booking.check_in}–${booking.check_out} was cancelled.${refunded ? ' The guest has been refunded.' : ''}`,
        { bookingId: booking.id });

      return updated.rows[0];
    });

    res.json({ message: 'Booking cancelled.', booking: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found.' });
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot cancel this booking.' });
    if (err.code === 'NOT_CANCELLABLE') return res.status(400).json({ error: 'This booking can no longer be cancelled.' });
    if (err.code === 'TOO_LATE') return res.status(400).json({ error: 'Check-in has already passed.' });
    if (err.code === 'ESCROW_INSUFFICIENT') return res.status(500).json({ error: 'Escrow balance inconsistency detected — contact support.' });
    console.error('cancelBooking error:', err);
    res.status(500).json({ error: 'Could not cancel booking.' });
  }
}

// ============================================================
// ADMIN — verify manual payment, move to escrow (mirrors
// ordersController.confirmPayment)
// ============================================================

export async function adminListPendingPayments(req, res) {
  try {
    const result = await query(
      `SELECT b.*, p.method, p.transaction_reference, p.proof_image, p.payer_phone, pr.title AS property_title
       FROM stays_bookings b
       JOIN stays_booking_payments p ON p.booking_id = b.id
       JOIN stays_properties pr ON pr.id = b.property_id
       WHERE b.status = 'payment_submitted' AND p.status = 'submitted'
       ORDER BY b.created_at ASC`
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error('adminListPendingPayments error:', err);
    res.status(500).json({ error: 'Could not load pending payments.' });
  }
}

// PATCH /api/stays/admin/bookings/:id/confirm-payment
export async function adminConfirmBookingPayment(req, res) {
  const { id } = req.params;
  try {
    const booking = await withTransaction(async (client) => {
      const flipped = await client.query(
        `UPDATE stays_bookings SET status = 'confirmed' WHERE id = $1 AND status = 'payment_submitted' RETURNING *`,
        [id]
      );
      if (flipped.rows.length === 0) {
        const existing = await client.query(`SELECT id FROM stays_bookings WHERE id = $1`, [id]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        const err = new Error('ALREADY_PROCESSED'); err.code = 'ALREADY_PROCESSED'; throw err;
      }
      const booking = flipped.rows[0];

      await client.query(`UPDATE stays_booking_payments SET status = 'succeeded' WHERE booking_id = $1`, [id]);

      const escrowWallet = await client.query(`UPDATE wallets SET balance = balance + $1 WHERE type = 'escrow' RETURNING *`, [booking.total_amount]);
      await logWalletTransaction(client, {
        walletId: escrowWallet.rows[0].id, direction: 'credit', amount: booking.total_amount, balanceAfter: escrowWallet.rows[0].balance,
        referenceType: 'stays_booking_escrow', referenceId: booking.id, note: 'Guest payment held in escrow', createdBy: req.user.id,
      });

      await client.query(`UPDATE stays_properties SET bookings_count = bookings_count + 1 WHERE id = $1`, [booking.property_id]);

      await notifyUser(client, booking.guest_id, 'stays_booking_confirmed', 'Booking confirmed!',
        `Your booking for ${booking.check_in} to ${booking.check_out} is confirmed.`, { bookingId: booking.id });
      await notifyUser(client, booking.host_id, 'stays_booking_confirmed', 'Booking confirmed',
        `A booking for ${booking.check_in} to ${booking.check_out} is confirmed and paid.`, { bookingId: booking.id });

      await issuePassForBooking(client, booking);

      return booking;
    });

    res.json({ message: 'Payment confirmed. Funds are held in escrow until the stay is completed.', booking });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found.' });
    if (err.code === 'ALREADY_PROCESSED') return res.status(409).json({ error: 'This payment has already been processed.' });
    console.error('adminConfirmBookingPayment error:', err);
    res.status(500).json({ error: 'Could not confirm payment.' });
  }
}

// PATCH /api/stays/admin/bookings/:id/reject-payment  { reason }
export async function adminRejectBookingPayment(req, res) {
  const { id } = req.params;
  const { reason } = req.body || {};
  try {
    const result = await withTransaction(async (client) => {
      const flipped = await client.query(
        `UPDATE stays_bookings SET status = 'rejected', cancellation_reason = $2 WHERE id = $1 AND status = 'payment_submitted' RETURNING *`,
        [id, reason || 'Payment could not be verified.']
      );
      if (flipped.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
      const booking = flipped.rows[0];
      await client.query(`UPDATE stays_booking_payments SET status = 'failed' WHERE booking_id = $1`, [id]);
      await releaseBookingDates(client, booking.id);
      await notifyUser(client, booking.guest_id, 'stays_booking_cancelled', 'Booking payment rejected',
        reason || 'Your payment could not be verified for this booking.', { bookingId: booking.id });
      return booking;
    });
    res.json({ message: 'Booking rejected and dates released.', booking: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'No submitted payment found for this booking.' });
    console.error('adminRejectBookingPayment error:', err);
    res.status(500).json({ error: 'Could not reject payment.' });
  }
}

// ============================================================
// COMPLETION + PAYOUT — host/admin marks the stay completed after
// check-out, which releases escrow to the host (mirrors
// ordersController.releaseFunds/payOutClaimedOrder).
// ============================================================

// PATCH /api/stays/bookings/:id/complete — host or admin only, and only
// once check_out has actually passed (a guest can't be charged out of a
// stay that hasn't happened yet).
export async function completeBookingAndPayout(req, res) {
  const { id } = req.params;
  try {
    const result = await withTransaction(async (client) => {
      const claimed = await client.query(
        `UPDATE stays_bookings SET status = 'completed', funds_released_at = now()
         WHERE id = $1 AND status = 'confirmed' AND funds_released_at IS NULL
           AND check_out <= CURRENT_DATE AND (host_id = $2 OR $3 = TRUE)
         RETURNING *`,
        [id, req.user.id, req.user.isAdmin || false]
      );
      if (claimed.rows.length === 0) {
        const existing = await client.query(`SELECT id, status, check_out, funds_released_at, host_id FROM stays_bookings WHERE id = $1`, [id]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        const b = existing.rows[0];
        if (b.funds_released_at) { const err = new Error('ALREADY_RELEASED'); err.code = 'ALREADY_RELEASED'; throw err; }
        if (b.host_id !== req.user.id && !req.user.isAdmin) { const err = new Error('FORBIDDEN'); err.code = 'FORBIDDEN'; throw err; }
        if (new Date(b.check_out) > new Date()) { const err = new Error('NOT_YET_CHECKED_OUT'); err.code = 'NOT_YET_CHECKED_OUT'; throw err; }
        const err = new Error('NOT_CONFIRMED'); err.code = 'NOT_CONFIRMED'; throw err;
      }
      const booking = claimed.rows[0];
      const hostAmount = Number(booking.total_amount) - Number(booking.platform_fee_amount);

      const escrowWallet = await client.query(`UPDATE wallets SET balance = balance - $1 WHERE type = 'escrow' AND balance >= $1 RETURNING *`, [booking.total_amount]);
      if (escrowWallet.rows.length === 0) { const err = new Error('ESCROW_INSUFFICIENT'); err.code = 'ESCROW_INSUFFICIENT'; throw err; }
      await logWalletTransaction(client, {
        walletId: escrowWallet.rows[0].id, direction: 'debit', amount: booking.total_amount, balanceAfter: escrowWallet.rows[0].balance,
        referenceType: 'stays_booking_release', referenceId: booking.id, note: 'Stay completed — payout released', createdBy: req.user.id,
      });

      const hostWallet = await client.query(`UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2 AND type = 'user' RETURNING *`, [hostAmount, booking.host_id]);
      await logWalletTransaction(client, {
        walletId: hostWallet.rows[0].id, direction: 'credit', amount: hostAmount, balanceAfter: hostWallet.rows[0].balance,
        referenceType: 'stays_booking_release', referenceId: booking.id, note: 'Stay payout', createdBy: req.user.id,
      });

      const platformWallet = await client.query(`UPDATE wallets SET balance = balance + $1 WHERE type = 'platform' RETURNING *`, [booking.platform_fee_amount]);
      await logWalletTransaction(client, {
        walletId: platformWallet.rows[0].id, direction: 'credit', amount: booking.platform_fee_amount, balanceAfter: platformWallet.rows[0].balance,
        referenceType: 'platform_fee', referenceId: booking.id, note: 'Stays platform commission', createdBy: req.user.id,
      });

      await notifyUser(client, booking.host_id, 'stays_payout_released', 'Payout released',
        `${booking.currency} ${hostAmount.toFixed(2)} was released to your wallet for a completed stay.`, { bookingId: booking.id });

      return { booking, hostAmount };
    });

    res.json({ message: 'Stay completed. Funds released to host.', booking: result.booking, hostAmount: result.hostAmount });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found.' });
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: 'Only the host or an admin can complete this booking.' });
    if (err.code === 'NOT_YET_CHECKED_OUT') return res.status(400).json({ error: 'This booking cannot be completed until its check-out date has passed.' });
    if (err.code === 'NOT_CONFIRMED') return res.status(400).json({ error: 'Only a confirmed, paid booking can be completed.' });
    if (err.code === 'ALREADY_RELEASED') return res.status(409).json({ error: 'Funds for this booking have already been released.' });
    if (err.code === 'ESCROW_INSUFFICIENT') return res.status(500).json({ error: 'Escrow balance inconsistency detected — contact support.' });
    console.error('completeBookingAndPayout error:', err);
    res.status(500).json({ error: 'Could not complete booking.' });
  }
}
