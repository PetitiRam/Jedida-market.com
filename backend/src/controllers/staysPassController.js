import { query } from '../config/db.js';
import { nextDocumentNumber, generateVerificationCode } from '../services/documentNumberService.js';
import { signPass, computePassExpiry, computeShareExpiry, streamStayPassPdf } from '../services/staysPassService.js';
import crypto from 'crypto';

async function notifyUser(client, userId, type, title, body, metadata = {}) {
  const runner = client || { query };
  await runner.query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

// Called from staysBookingController.adminConfirmBookingPayment once a
// booking flips to 'confirmed', inside the same transaction — a pass
// exists for every confirmed booking, never as a separate manual step.
export async function issuePassForBooking(client, booking) {
  const [propResult, guestResult, hostResult] = await Promise.all([
    client.query(`SELECT title, address_line, city, country, emergency_contact_name, emergency_contact_phone FROM stays_properties WHERE id = $1`, [booking.property_id]),
    client.query(`SELECT full_name FROM users WHERE id = $1`, [booking.guest_id]),
    client.query(`SELECT full_name FROM users WHERE id = $1`, [booking.host_id]),
  ]);
  const property = propResult.rows[0];
  const guestName = guestResult.rows[0]?.full_name || 'Guest';
  const hostName = hostResult.rows[0]?.full_name || 'Host';
  const address = [property.address_line, property.city, property.country].filter(Boolean).join(', ');
  const emergencyContact = property.emergency_contact_phone
    ? `${property.emergency_contact_name || 'Host'} · ${property.emergency_contact_phone}`
    : null;

  const passNumber = await nextDocumentNumber('stays_pass', client);
  const verificationCode = generateVerificationCode();
  const expiresAt = computePassExpiry(booking.check_out);

  const signature = signPass({
    pass_number: passNumber, booking_id: booking.id, guest_name: guestName, property_name: property.title,
    check_in: booking.check_in, check_out: booking.check_out, guests_count: booking.guests_count,
  });

  const result = await client.query(
    `INSERT INTO stays_stay_passes
       (booking_id, pass_number, verification_code, guest_name, host_name, property_name, property_address,
        emergency_contact, check_in, check_out, guests_count, expires_at, digital_signature)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [booking.id, passNumber, verificationCode, guestName, hostName, property.title, address || null,
     emergencyContact, booking.check_in, booking.check_out, booking.guests_count, expiresAt, signature]
  );

  await notifyUser(client, booking.guest_id, 'stays_pass_ready', 'Your Stay Pass is ready',
    `Your Digital Stay Pass for "${property.title}" has been generated.`, { bookingId: booking.id, passNumber });

  return result.rows[0];
}

// Revokes the pass tied to a booking, if one exists — called from
// cancelBooking when a confirmed (already-passed) booking is cancelled.
export async function revokePassForBooking(client, bookingId, reason) {
  await client.query(
    `UPDATE stays_stay_passes SET status = 'revoked', revoked_at = now(), revoked_reason = $2
     WHERE booking_id = $1 AND status = 'valid'`,
    [bookingId, reason || 'Booking cancelled']
  );
}

function lazyExpire(pass) {
  if (pass.status === 'valid' && new Date(pass.expires_at) < new Date()) {
    query(`UPDATE stays_stay_passes SET status = 'expired' WHERE id = $1 AND status = 'valid'`, [pass.id]).catch(() => {});
    return { ...pass, status: 'expired' };
  }
  return pass;
}

async function getPassForBookingChecked(bookingId, userId, isAdmin) {
  const result = await query(
    `SELECT sp.*, b.total_amount, b.currency, b.status AS booking_status, b.guest_id, b.host_id
     FROM stays_stay_passes sp JOIN stays_bookings b ON b.id = sp.booking_id
     WHERE sp.booking_id = $1`,
    [bookingId]
  );
  const pass = result.rows[0];
  if (!pass) return { error: 'NOT_FOUND' };
  if (pass.guest_id !== userId && pass.host_id !== userId && !isAdmin) return { error: 'FORBIDDEN' };
  return { pass: lazyExpire(pass) };
}

// GET /api/stays/bookings/:id/pass
export async function getPassForBooking(req, res) {
  const { id } = req.params;
  const { pass, error } = await getPassForBookingChecked(id, req.user.id, req.user.isAdmin);
  if (error === 'NOT_FOUND') return res.status(404).json({ error: 'No Stay Pass exists for this booking yet — it is issued once payment is confirmed.' });
  if (error === 'FORBIDDEN') return res.status(403).json({ error: 'You cannot view this Stay Pass.' });
  res.json({ pass });
}

// GET /api/stays/bookings/:id/pass/pdf
export async function getPassPdf(req, res) {
  const { id } = req.params;
  try {
    const { pass, error } = await getPassForBookingChecked(id, req.user.id, req.user.isAdmin);
    if (error) return res.status(error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Stay Pass not available.' });
    const bookingResult = await query(`SELECT id, total_amount, currency, status FROM stays_bookings WHERE id = $1`, [id]);
    await streamStayPassPdf(res, { pass, booking: bookingResult.rows[0] });
  } catch (err) {
    console.error('getPassPdf error:', err);
    res.status(500).json({ error: 'Could not generate Stay Pass PDF.' });
  }
}

// ============================================================
// PUBLIC VERIFICATION — no auth, no payment info, ever.
// ============================================================

function publicPassView(pass) {
  return {
    passNumber: pass.pass_number,
    propertyName: pass.property_name,
    guestName: pass.guest_name,
    hostName: pass.host_name,
    checkIn: pass.check_in,
    checkOut: pass.check_out,
    guestsCount: pass.guests_count,
    status: pass.status,
    issuedAt: pass.issued_at,
    expiresAt: pass.expires_at,
  };
}

// GET /api/stays/verify/:code
export async function verifyPassByCode(req, res) {
  const { code } = req.params;
  try {
    const result = await query(`SELECT * FROM stays_stay_passes WHERE verification_code = $1`, [code]);
    const pass = result.rows[0];
    if (!pass) return res.status(404).json({ verified: false, message: 'No Jedida Stay Pass matches this code.' });
    const current = lazyExpire(pass);
    res.json({
      verified: current.status === 'valid',
      message: current.status === 'valid' ? 'Verified Jedida Stay Pass' : `This Stay Pass is ${current.status}.`,
      pass: publicPassView(current),
    });
  } catch (err) {
    console.error('verifyPassByCode error:', err);
    res.status(500).json({ error: 'Could not verify this Stay Pass.' });
  }
}

// GET /api/stays/verify/share/:token — time-boxed link a guest handed to
// someone else (e.g. WhatsApp). Same safe public view, additionally
// gated by the share link's own expiry/revocation.
export async function verifyPassByShareToken(req, res) {
  const { token } = req.params;
  try {
    const shareResult = await query(
      `SELECT s.*, sp.* FROM stays_pass_shares s JOIN stays_stay_passes sp ON sp.id = s.pass_id WHERE s.share_token = $1`,
      [token]
    );
    const row = shareResult.rows[0];
    if (!row) return res.status(404).json({ verified: false, message: 'This share link is invalid.' });
    if (row.revoked_at) return res.status(410).json({ verified: false, message: 'This share link has been revoked.' });
    if (new Date(row.expires_at) < new Date()) return res.status(410).json({ verified: false, message: 'This share link has expired.' });

    const current = lazyExpire(row);
    res.json({
      verified: current.status === 'valid',
      message: current.status === 'valid' ? 'Verified Jedida Stay Pass' : `This Stay Pass is ${current.status}.`,
      pass: publicPassView(current),
    });
  } catch (err) {
    console.error('verifyPassByShareToken error:', err);
    res.status(500).json({ error: 'Could not verify this share link.' });
  }
}

// ============================================================
// SHAREABLE LINKS + REVOCATION
// ============================================================

// POST /api/stays/passes/:id/share  { duration: 'hourly'|'daily'|'weekend'|'weekly'|'custom', customHours, label }
export async function createShareLink(req, res) {
  const { id } = req.params;
  const { duration = 'daily', customHours, label } = req.body || {};
  try {
    const passResult = await query(`SELECT * FROM stays_stay_passes WHERE id = $1`, [id]);
    const pass = passResult.rows[0];
    if (!pass) return res.status(404).json({ error: 'Stay Pass not found.' });

    const ownerCheck = await query(`SELECT guest_id FROM stays_bookings WHERE id = $1`, [pass.booking_id]);
    if (ownerCheck.rows[0]?.guest_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Only the guest can share this Stay Pass.' });
    }
    if (pass.status !== 'valid') return res.status(400).json({ error: `Cannot share a ${pass.status} pass.` });

    const shareToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = computeShareExpiry(duration, customHours);
    const result = await query(
      `INSERT INTO stays_pass_shares (pass_id, share_token, label, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, shareToken, label || null, expiresAt, req.user.id]
    );
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.status(201).json({
      share: result.rows[0],
      shareUrl: `${frontendUrl.split(',')[0].trim()}/verify-stay/share/${shareToken}`,
    });
  } catch (err) {
    console.error('createShareLink error:', err);
    res.status(500).json({ error: 'Could not create share link.' });
  }
}

// GET /api/stays/passes/:id/shares — guest's own list, to revoke/manage
export async function listShareLinks(req, res) {
  const { id } = req.params;
  try {
    const ownerCheck = await query(
      `SELECT b.guest_id FROM stays_stay_passes sp JOIN stays_bookings b ON b.id = sp.booking_id WHERE sp.id = $1`,
      [id]
    );
    if (!ownerCheck.rows[0] || (ownerCheck.rows[0].guest_id !== req.user.id && !req.user.isAdmin)) {
      return res.status(403).json({ error: 'You cannot view shares for this pass.' });
    }
    const result = await query(`SELECT * FROM stays_pass_shares WHERE pass_id = $1 ORDER BY created_at DESC`, [id]);
    res.json({ shares: result.rows });
  } catch (err) {
    console.error('listShareLinks error:', err);
    res.status(500).json({ error: 'Could not load share links.' });
  }
}

// PATCH /api/stays/passes/:id/shares/:shareId/revoke
export async function revokeShareLink(req, res) {
  const { id, shareId } = req.params;
  try {
    const ownerCheck = await query(
      `SELECT b.guest_id FROM stays_stay_passes sp JOIN stays_bookings b ON b.id = sp.booking_id WHERE sp.id = $1`,
      [id]
    );
    if (!ownerCheck.rows[0] || (ownerCheck.rows[0].guest_id !== req.user.id && !req.user.isAdmin)) {
      return res.status(403).json({ error: 'You cannot manage shares for this pass.' });
    }
    await query(`UPDATE stays_pass_shares SET revoked_at = now() WHERE id = $1 AND pass_id = $2`, [shareId, id]);
    res.json({ message: 'Share link revoked.' });
  } catch (err) {
    console.error('revokeShareLink error:', err);
    res.status(500).json({ error: 'Could not revoke share link.' });
  }
}

// PATCH /api/stays/admin/passes/:id/revoke  { reason } — admin/Trust & Safety
export async function adminRevokePass(req, res) {
  const { id } = req.params;
  const { reason } = req.body || {};
  try {
    const result = await query(
      `UPDATE stays_stay_passes SET status = 'revoked', revoked_at = now(), revoked_reason = $2 WHERE id = $1 RETURNING *`,
      [id, reason || 'Revoked by Jedida Trust & Safety']
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Stay Pass not found.' });
    res.json({ message: 'Stay Pass revoked.', pass: result.rows[0] });
  } catch (err) {
    console.error('adminRevokePass error:', err);
    res.status(500).json({ error: 'Could not revoke Stay Pass.' });
  }
}
