import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const BRAND_GREEN = '#0F5132';
const MUTED = '#5B6760';
const BORDER = '#D8E0DA';

// A Stay Pass verifies at its own frontend route (/verify-stay/:code), not
// the generic document verification page at /verify/:code — the two code
// spaces (stays_stay_passes vs. documents) are unrelated, and reusing
// qrService.generateQrDataUrl would point the QR at the wrong page.
function stayPassVerificationUrl(verificationCode) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontendUrl.split(',')[0].trim()}/verify-stay/${verificationCode}`;
}

async function generateStayPassQrDataUrl(verificationCode) {
  try {
    return await QRCode.toDataURL(stayPassVerificationUrl(verificationCode), {
      errorCorrectionLevel: 'M', margin: 1, width: 260,
    });
  } catch (err) {
    console.error('Stay Pass QR generation failed:', err);
    return null;
  }
}

// HMAC over the fields that matter for verification, so a tampered PDF/QR
// (changed dates, changed guest) fails signature re-check even if someone
// edits a downloaded copy. Falls back to JWT_SECRET (already required for
// auth) rather than demanding a brand-new env var for one feature.
const SIGNING_SECRET = process.env.STAY_PASS_SECRET || process.env.JWT_SECRET || 'jedida-stay-pass-dev-secret';

export function signPass(fields) {
  const payload = [
    fields.pass_number, fields.booking_id, fields.guest_name, fields.property_name,
    fields.check_in, fields.check_out, fields.guests_count,
  ].join('|');
  return crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
}

export function verifyPassSignature(pass) {
  const expected = signPass({
    pass_number: pass.pass_number, booking_id: pass.booking_id, guest_name: pass.guest_name,
    property_name: pass.property_name, check_in: pass.check_in, check_out: pass.check_out,
    guests_count: pass.guests_count,
  });
  return expected === pass.digital_signature;
}

// Check-out date + 24h grace, matching the spec's "Daily" default
// duration. Custom/hourly/weekly durations apply to share links
// (createShareLink below), not the pass's own core validity — the pass
// itself should stay valid at least through the stay it documents.
export function computePassExpiry(checkOutDate) {
  const expiry = new Date(checkOutDate);
  expiry.setHours(expiry.getHours() + 24);
  return expiry;
}

const SHARE_DURATIONS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekend: 3 * 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export function computeShareExpiry(duration, customHours) {
  if (duration === 'custom') {
    const hours = Number(customHours) > 0 ? Number(customHours) : 24;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }
  const ms = SHARE_DURATIONS[duration] || SHARE_DURATIONS.daily;
  return new Date(Date.now() + ms);
}

function money(amount, currency) {
  return `${currency || 'USD'} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Streams the branded PDF straight to the response, same on-demand
// pattern as pdfService.streamDocumentPdf (always reflects current
// status — e.g. a REVOKED stamp — with no regeneration step).
export async function streamStayPassPdf(res, { pass, booking }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${pass.pass_number}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).fillColor(BRAND_GREEN).text('JEDIDA STAYS', { align: 'left' });
  doc.fontSize(11).fillColor(MUTED).text('Digital Stay Pass', { align: 'left' });
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor(BORDER).stroke();
  doc.moveDown();

  if (pass.status !== 'valid') {
    doc.fontSize(28).fillColor('#C23B3B').text(pass.status.toUpperCase(), { align: 'center' });
    doc.moveDown();
  }

  doc.fontSize(14).fillColor('#1E293B').text(pass.property_name, { align: 'left' });
  if (pass.property_address) doc.fontSize(10).fillColor(MUTED).text(pass.property_address);
  doc.moveDown();

  const rows = [
    ['Pass Number', pass.pass_number],
    ['Booking Number', booking.id],
    ['Guest', pass.guest_name],
    ['Host', pass.host_name],
    ['Check-in', pass.check_in.toISOString?.().slice(0, 10) || pass.check_in],
    ['Check-out', pass.check_out.toISOString?.().slice(0, 10) || pass.check_out],
    ['Guests', String(pass.guests_count)],
    ['Booking Status', booking.status],
    ['Total Paid', money(booking.total_amount, booking.currency)],
    ['Emergency Contact', pass.emergency_contact || '—'],
    ['Issued', pass.issued_at.toISOString?.().slice(0, 10) || pass.issued_at],
    ['Expires', pass.expires_at.toISOString?.().slice(0, 16).replace('T', ' ') || pass.expires_at],
  ];
  doc.fontSize(10);
  for (const [label, value] of rows) {
    doc.fillColor(MUTED).text(label, 40, doc.y, { continued: true, width: 160 });
    doc.fillColor('#1E293B').text(`  ${value}`);
  }

  doc.moveDown();
  const qr = await generateStayPassQrDataUrl(pass.verification_code);
  if (qr) {
    const buffer = Buffer.from(qr.split(',')[1], 'base64');
    doc.image(buffer, 40, doc.y, { width: 110 });
    doc.fontSize(9).fillColor(MUTED).text('Scan to verify this Stay Pass on Jedida', 160, doc.y - 60, { width: 300 });
    doc.fontSize(9).text(`Verification code: ${pass.verification_code}`, 160, doc.y + 4, { width: 300 });
    doc.moveDown(4);
  }

  doc.fontSize(8).fillColor(MUTED).text(`Digital signature: ${pass.digital_signature}`, 40, 770, { width: 515 });
  doc.text('This pass is verified exclusively at jedida.com/verify — no payment details are ever shown to anyone scanning it.', 40, 782, { width: 515 });

  doc.end();
}
