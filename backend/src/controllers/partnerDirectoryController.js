import { query } from '../config/db.js';

// ===== Public: browse the directory =====
// Only approved partnerships that have explicitly opted into being
// listed show up here — being an approved partner does not, by itself,
// make a company publicly discoverable.
export async function listDirectory(req, res) {
  const { category, dropshippingOnly } = req.query;
  const conditions = [`status = 'approved'`, 'directory_listed = TRUE'];
  const values = [];
  if (category) { values.push(category); conditions.push(`directory_category = $${values.length}`); }
  if (dropshippingOnly === 'true') conditions.push('dropshipping_available = TRUE');

  const result = await query(
    `SELECT id, company_name, logo_url, website, directory_tagline, directory_category, directory_try_url,
            dropshipping_available, partner_type
     FROM partner_applications WHERE ${conditions.join(' AND ')} ORDER BY company_name ASC`,
    values
  );
  res.json({ apps: result.rows });
}

export async function getDirectoryEntry(req, res) {
  const result = await query(
    `SELECT id, company_name, logo_url, website, directory_tagline, directory_category, directory_try_url,
            dropshipping_available, partner_type
     FROM partner_applications WHERE id = $1 AND status = 'approved' AND directory_listed = TRUE`,
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'This app is not listed in the directory.' });
  res.json({ app: result.rows[0] });
}

// POST /directory/:id/interest — "Try this app" without needing an
// account. Rate-limited at the route level against spam.
export async function submitInterest(req, res) {
  const { name, email, message } = req.body;
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email are required.' });

  const app = await query(
    `SELECT id, company_name, partner_user_id FROM partner_applications WHERE id = $1 AND status = 'approved' AND directory_listed = TRUE`,
    [req.params.id]
  );
  if (app.rows.length === 0) return res.status(404).json({ error: 'This app is not listed in the directory.' });

  await query(
    `INSERT INTO partner_app_leads (application_id, name, email, message, submitted_ip) VALUES ($1,$2,$3,$4,$5)`,
    [req.params.id, name.trim(), email.trim().toLowerCase(), message?.trim() || null, req.ip]
  );

  if (app.rows[0].partner_user_id) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'partner_update',$2,$3,$4)`,
      [app.rows[0].partner_user_id, 'New interest from the app directory', `${name.trim()} (${email.trim()}) wants to try ${app.rows[0].company_name}.`, { applicationId: req.params.id }]
    );
  }
  res.status(201).json({ message: 'Thanks! The partner has been notified and may reach out to you directly.' });
}

// ===== Dropshipping enrollment =====
// Gated on the signed-in user acknowledging *that specific partner's*
// current instructions text — the acknowledged copy is snapshotted onto
// the enrollment row, so "the user followed the platform instructions"
// is a verifiable fact, not just a checkbox that got flipped once.
export async function getDropshipStatus(req, res) {
  const app = await query(
    `SELECT id, company_name, dropshipping_available, dropshipping_instructions FROM partner_applications
     WHERE id = $1 AND status = 'approved' AND directory_listed = TRUE`,
    [req.params.id]
  );
  if (app.rows.length === 0) return res.status(404).json({ error: 'This app is not listed in the directory.' });
  if (!app.rows[0].dropshipping_available) return res.status(404).json({ error: 'This partner does not offer dropshipping.' });

  const enrollment = await query(
    `SELECT status, created_at FROM partner_dropship_enrollments WHERE application_id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json({
    app: { id: app.rows[0].id, companyName: app.rows[0].company_name, instructions: app.rows[0].dropshipping_instructions },
    enrollment: enrollment.rows[0] || null
  });
}

export async function enrollDropshipping(req, res) {
  const { acknowledged } = req.body;
  if (!acknowledged) return res.status(400).json({ error: 'You must confirm you have read and will follow the instructions.' });

  const app = await query(
    `SELECT id, company_name, partner_user_id, dropshipping_available, dropshipping_instructions FROM partner_applications
     WHERE id = $1 AND status = 'approved' AND directory_listed = TRUE`,
    [req.params.id]
  );
  if (app.rows.length === 0) return res.status(404).json({ error: 'This app is not listed in the directory.' });
  if (!app.rows[0].dropshipping_available) return res.status(403).json({ error: 'This partner does not offer dropshipping.' });
  if (!app.rows[0].dropshipping_instructions?.trim()) {
    return res.status(409).json({ error: 'This partner has not published dropshipping instructions yet.' });
  }

  const result = await query(
    `INSERT INTO partner_dropship_enrollments (application_id, user_id, accepted_instructions_snapshot, status)
     VALUES ($1,$2,$3,'active')
     ON CONFLICT (application_id, user_id) DO UPDATE SET status = 'active', accepted_instructions_snapshot = EXCLUDED.accepted_instructions_snapshot, revoked_at = NULL
     RETURNING id, status, created_at`,
    [req.params.id, req.user.id, app.rows[0].dropshipping_instructions]
  );

  if (app.rows[0].partner_user_id) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'partner_update',$2,$3,$4)`,
      [app.rows[0].partner_user_id, 'New dropshipping enrollment', 'A marketplace seller has enrolled to dropship through your integration.', { applicationId: req.params.id }]
    );
  }
  res.status(201).json({ message: `You're enrolled to dropship with ${app.rows[0].company_name}.`, enrollment: result.rows[0] });
}

export async function revokeDropshipEnrollment(req, res) {
  const result = await query(
    `UPDATE partner_dropship_enrollments SET status = 'revoked', revoked_at = now() WHERE application_id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'No enrollment found.' });
  res.json({ message: 'Dropshipping enrollment cancelled.' });
}
