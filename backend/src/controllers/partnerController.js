import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import cryptoRandomString from 'crypto-random-string';
import { query, pool } from '../config/db.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUploadAny } from '../services/uploadSecurity.js';
import {
  sendPartnerApplicationReceivedEmail, sendPartnerApplicationDecisionEmail,
  sendPartnerAccountProvisionedEmail
} from '../services/emailService.js';

const PARTNER_TYPES = [
  'payment_provider', 'delivery_company', 'technology_company', 'erp_provider',
  'pos_provider', 'ai_provider', 'financial_institution', 'government_agency',
  'marketing_platform', 'other'
];

const DOCUMENT_TYPES = [
  'certificate_of_incorporation', 'business_license', 'company_profile',
  'tax_registration', 'other'
];

function genReferenceCode() {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  const y = new Date().getFullYear();
  return `JPX-${y}-${rand}`;
}

// ===== Public: document upload (used during the multi-file document step
// of the application form, before the application itself is submitted) =====
export async function uploadPartnerDocument(req, res) {
  if (!isCloudinaryConfigured()) {
    return res.status(501).json({
      error: 'Document upload is not configured on this server yet. Please contact support@jedidamarketplace.com to submit documents directly.'
    });
  }

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file was uploaded.' });

  const { docType } = req.body;
  if (!docType || !DOCUMENT_TYPES.includes(docType)) {
    return res.status(400).json({ error: 'A valid document type is required.' });
  }

  const check = await validateUploadAny(file, ['document', 'image']);
  if (!check.ok) {
    if (check.internalReason) console.warn('Partner document blocked by security scan:', check.internalReason);
    return res.status(400).json({ error: check.error });
  }

  try {
    const isImage = file.mimetype.startsWith('image/');
    // Business/registration documents are private — signed, time-limited
    // delivery URL rather than a permanently public one.
    const result = await uploadToCloudinary(file.buffer, file.originalname, isImage ? 'image' : 'raw', 'jedida-marketplace/partner-applications', { sensitive: true });
    return res.status(201).json({
      message: 'Document uploaded.',
      document: {
        docType,
        fileName: file.originalname,
        fileUrl: result.url,
        bytes: result.bytes || file.size
      }
    });
  } catch (err) {
    console.error('Partner document upload error:', err);
    return res.status(502).json({ error: 'Could not upload document. Please try again.' });
  }
}

// ===== Public: submit application =====
export async function submitApplication(req, res) {
  const {
    companyName, registrationNumber, businessEmail, businessPhone, website, country, physicalAddress,
    contactFullName, contactPosition, contactEmail, contactPhone,
    partnerType, partnershipReason, servicesProvided, expectedBenefits,
    acceptedPartnershipTerms, acceptedPrivacyPolicy, acceptedDataProtectionPolicy,
    documents
  } = req.body;

  const required = {
    companyName, registrationNumber, businessEmail, businessPhone, country, physicalAddress,
    contactFullName, contactPosition, contactEmail, contactPhone,
    partnerType, partnershipReason, servicesProvided, expectedBenefits
  };
  const missing = Object.entries(required).filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }
  if (!PARTNER_TYPES.includes(partnerType)) {
    return res.status(400).json({ error: 'Invalid partner type.' });
  }
  if (!acceptedPartnershipTerms || !acceptedPrivacyPolicy || !acceptedDataProtectionPolicy) {
    return res.status(400).json({ error: 'You must accept the Partnership Terms, Privacy Policy, and Data Protection Policy to apply.' });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(businessEmail) || !emailPattern.test(contactEmail)) {
    return res.status(400).json({ error: 'Please provide valid email addresses.' });
  }

  const docs = Array.isArray(documents) ? documents.filter((d) => d?.fileUrl && DOCUMENT_TYPES.includes(d?.docType)) : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let referenceCode = genReferenceCode();
    // Extremely unlikely collision, but guard anyway.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await client.query('SELECT 1 FROM partner_applications WHERE reference_code = $1', [referenceCode]);
      if (exists.rows.length === 0) break;
      referenceCode = genReferenceCode();
    }

    const result = await client.query(
      `INSERT INTO partner_applications (
        reference_code, company_name, registration_number, business_email, business_phone, website, country, physical_address,
        contact_full_name, contact_position, contact_email, contact_phone,
        partner_type, partnership_reason, services_provided, expected_benefits,
        accepted_partnership_terms, accepted_privacy_policy, accepted_data_protection_policy,
        submitted_ip
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        referenceCode, companyName.trim(), registrationNumber.trim(), businessEmail.trim().toLowerCase(), businessPhone.trim(),
        website?.trim() || null, country.trim(), physicalAddress.trim(),
        contactFullName.trim(), contactPosition.trim(), contactEmail.trim().toLowerCase(), contactPhone.trim(),
        partnerType, partnershipReason.trim(), servicesProvided.trim(), expectedBenefits.trim(),
        true, true, true,
        req.ip || null
      ]
    );
    const application = result.rows[0];

    for (const doc of docs) {
      await client.query(
        `INSERT INTO partner_application_documents (application_id, doc_type, file_name, file_url, bytes)
         VALUES ($1,$2,$3,$4,$5)`,
        [application.id, doc.docType, doc.fileName || doc.docType, doc.fileUrl, doc.bytes || null]
      );
    }

    // Notify every admin — same pattern used across the admin approval queues.
    const admins = await client.query('SELECT id FROM users WHERE is_admin = TRUE');
    for (const admin of admins.rows) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, metadata)
         VALUES ($1,'system_announcement','New partner application',$2,$3)`,
        [admin.id, `${application.company_name} applied to become a JEDIDA partner (${referenceCode}).`, { applicationId: application.id }]
      );
    }

    await client.query('COMMIT');

    sendPartnerApplicationReceivedEmail(application.business_email, {
      companyName: application.company_name,
      referenceCode
    }).catch((err) => console.error('Partner receipt email error:', err));

    return res.status(201).json({
      message: 'Application submitted successfully.',
      application: { id: application.id, referenceCode, status: application.status }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit partner application error:', err);
    return res.status(500).json({ error: 'Could not submit application. Please try again.' });
  } finally {
    client.release();
  }
}

// Every status-changing action goes through here: it captures the
// before/after status in one transaction, writes the single audit-log
// row that both the "Status History" and "Audit Log" views read from,
// and returns the updated row — so approve/reject/hold/bulk-actions all
// stay consistent instead of each reimplementing the same three steps.
async function applyStatusChange(client, { applicationId, newStatus, notes, adminId }) {
  const current = await client.query('SELECT * FROM partner_applications WHERE id = $1 FOR UPDATE', [applicationId]);
  if (current.rows.length === 0) return null;
  const previousStatus = current.rows[0].status;

  const updated = await client.query(
    `UPDATE partner_applications SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $4 RETURNING *`,
    [newStatus, notes || null, adminId, applicationId]
  );

  await client.query(
    `INSERT INTO partner_application_audit_log (application_id, admin_id, action, previous_status, new_status, notes)
     VALUES ($1,$2,'status_change',$3,$4,$5)`,
    [applicationId, adminId, previousStatus, newStatus, notes || null]
  );

  return { application: updated.rows[0], previousStatus };
}

async function uniqueUsername(client, base) {
  const cleaned = base.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24) || 'partner';
  let candidate = cleaned;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const exists = await client.query('SELECT 1 FROM users WHERE username = $1', [candidate]);
    if (exists.rows.length === 0) return candidate;
    candidate = `${cleaned}${crypto.randomBytes(2).toString('hex')}`.slice(0, 30);
  }
  return `${cleaned}${Date.now()}`.slice(0, 30);
}

// Approval turns a company application into a real, signed-in platform
// user: same users table, same login/session machinery as every other
// role. Idempotent — if the application already has a partner_user_id
// (e.g. a reactivation after suspension), it just re-enables that
// account instead of creating a second one.
async function provisionPartnerAccount(client, application) {
  if (application.partner_user_id) {
    await client.query(`UPDATE users SET status = 'active' WHERE id = $1`, [application.partner_user_id]);
    return { created: false, temporaryPassword: null, username: null };
  }

  const username = await uniqueUsername(client, application.company_name.replace(/\s+/g, '.'));
  const temporaryPassword = cryptoRandomString({ length: 14, type: 'alphanumeric' });
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const userResult = await client.query(
    `INSERT INTO users (email, username, password_hash, full_name, phone_number, primary_role, is_admin, status, kyc_status, is_verified, must_change_password)
     VALUES ($1,$2,$3,$4,$5,'partner',FALSE,'active','not_submitted',TRUE,TRUE)
     RETURNING id`,
    [
      application.business_email, username, passwordHash,
      application.contact_full_name || application.company_name,
      application.contact_phone || application.business_phone
    ]
  );
  const partnerUserId = userResult.rows[0].id;

  await client.query(`UPDATE partner_applications SET partner_user_id = $1 WHERE id = $2`, [partnerUserId, application.id]);
  await client.query(
    `INSERT INTO partner_contacts (application_id, full_name, position, email, phone, is_primary)
     VALUES ($1,$2,$3,$4,$5,TRUE)`,
    [application.id, application.contact_full_name, application.contact_position, application.contact_email, application.contact_phone]
  );
  await client.query(
    `INSERT INTO partner_portal_audit_log (application_id, actor_id, actor_role, action, details)
     VALUES ($1,$2,'system','account_provisioned','{}')`,
    [application.id, partnerUserId]
  );

  return { created: true, temporaryPassword, username };
}

// In-app notification for a platform admin (assigned reviewer / super
// admins) — distinct from the applicant, who has no platform account and
// is reached by email only (sendPartnerApplicationDecisionEmail below).
async function notifyAdmin(client, userId, title, body, applicationId) {
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'system_announcement',$2,$3,$4)`,
    [userId, title, body, { applicationId }]
  );
}

const STATUS_LABELS = {
  pending: 'Submitted', under_review: 'Under Review', technical_review: 'Technical Review',
  business_review: 'Business Review', approved: 'Approved', rejected: 'Rejected',
  on_hold: 'On Hold', more_info_requested: 'More Information Requested', suspended: 'Suspended'
};

const VALID_DECISIONS = {
  under_review: 'under_review', technical_review: 'technical_review', business_review: 'business_review',
  approve: 'approved', reject: 'rejected', hold: 'on_hold', request_more_info: 'more_info_requested'
};

export async function reviewApplication(req, res) {
  const { id } = req.params;
  const { decision, notes } = req.body;
  const newStatus = VALID_DECISIONS[decision];
  if (!newStatus) {
    return res.status(400).json({ error: `decision must be one of: ${Object.keys(VALID_DECISIONS).join(', ')}.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await applyStatusChange(client, { applicationId: id, newStatus, notes, adminId: req.user.id });
    if (!result) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found.' });
    }
    const { application } = result;

    let provisioned = null;
    if (newStatus === 'approved') {
      provisioned = await provisionPartnerAccount(client, application);
    }

    // Assigned reviewer (if any, and not the admin who just acted) + every
    // super admin get an in-app notification; the applicant gets an email
    // for every stage, not just the final approve/reject, so they're never
    // left wondering where things stand.
    if (application.assigned_reviewer_id && application.assigned_reviewer_id !== req.user.id) {
      await notifyAdmin(client, application.assigned_reviewer_id,
        `Partner application ${STATUS_LABELS[newStatus].toLowerCase()}`,
        `${application.company_name} (${application.reference_code}) is now ${STATUS_LABELS[newStatus]}.`,
        application.id);
    }
    const superAdmins = await client.query(
      `SELECT id FROM users WHERE is_admin = TRUE AND (admin_role IS NULL OR admin_role = 'super_admin') AND id != $1`,
      [req.user.id]
    );
    for (const admin of superAdmins.rows) {
      await notifyAdmin(client, admin.id,
        `Partner application ${STATUS_LABELS[newStatus].toLowerCase()}`,
        `${application.company_name} (${application.reference_code}) moved to ${STATUS_LABELS[newStatus]}.`,
        application.id);
    }

    await client.query('COMMIT');

    sendPartnerApplicationDecisionEmail(application.business_email, {
      companyName: application.company_name,
      referenceCode: application.reference_code,
      status: newStatus,
      notes
    }).catch((err) => console.error('Partner decision email error:', err));

    if (provisioned?.created) {
      sendPartnerAccountProvisionedEmail(application.business_email, {
        companyName: application.company_name,
        referenceCode: application.reference_code,
        username: provisioned.username,
        temporaryPassword: provisioned.temporaryPassword,
        portalUrl: `${process.env.FRONTEND_URL || 'https://app.jedidamarketplace.com'}/partner-portal`
      }).catch((err) => console.error('Partner account provisioning email error:', err));
    }

    return res.json({ message: `Application moved to ${STATUS_LABELS[newStatus]}.`, application });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Review partner application error:', err);
    return res.status(500).json({ error: 'Could not update the application.' });
  } finally {
    client.release();
  }
}

// PATCH /api/admin/partners/bulk — same decisions as above, applied to
// several applications at once. Reuses applyStatusChange so a bulk action
// and a single one can never produce different audit-log shapes.
export async function bulkReviewApplications(req, res) {
  const { ids, decision, notes } = req.body;
  const newStatus = VALID_DECISIONS[decision];
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array.' });
  if (!newStatus) return res.status(400).json({ error: `decision must be one of: ${Object.keys(VALID_DECISIONS).join(', ')}.` });
  if (ids.length > 200) return res.status(400).json({ error: 'Bulk actions are limited to 200 applications at a time.' });

  const client = await pool.connect();
  const updated = [];
  const provisionedByApp = new Map();
  try {
    await client.query('BEGIN');
    for (const applicationId of ids) {
      const result = await applyStatusChange(client, { applicationId, newStatus, notes, adminId: req.user.id });
      if (result) {
        updated.push(result.application);
        if (newStatus === 'approved') {
          provisionedByApp.set(result.application.id, await provisionPartnerAccount(client, result.application));
        }
      }
    }
    await client.query('COMMIT');

    for (const application of updated) {
      sendPartnerApplicationDecisionEmail(application.business_email, {
        companyName: application.company_name,
        referenceCode: application.reference_code,
        status: newStatus,
        notes
      }).catch((err) => console.error('Partner decision email error:', err));

      const provisioned = provisionedByApp.get(application.id);
      if (provisioned?.created) {
        sendPartnerAccountProvisionedEmail(application.business_email, {
          companyName: application.company_name,
          referenceCode: application.reference_code,
          username: provisioned.username,
          temporaryPassword: provisioned.temporaryPassword,
          portalUrl: `${process.env.FRONTEND_URL || 'https://app.jedidamarketplace.com'}/partner-portal`
        }).catch((err) => console.error('Partner account provisioning email error:', err));
      }
    }

    return res.json({ message: `${updated.length} application(s) moved to ${STATUS_LABELS[newStatus]}.`, updated: updated.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk review partner applications error:', err);
    return res.status(500).json({ error: 'Could not update the applications.' });
  } finally {
    client.release();
  }
}

// PATCH /api/admin/partners/:id/assign-reviewer
export async function assignReviewer(req, res) {
  const { id } = req.params;
  const { reviewerId } = req.body;
  if (!reviewerId) return res.status(400).json({ error: 'reviewerId is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE partner_applications SET assigned_reviewer_id = $1 WHERE id = $2 RETURNING *`,
      [reviewerId, id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found.' });
    }
    const application = result.rows[0];
    await client.query(
      `INSERT INTO partner_application_audit_log (application_id, admin_id, action, notes) VALUES ($1,$2,'reviewer_assigned',$3)`,
      [id, req.user.id, `Assigned to reviewer ${reviewerId}`]
    );
    await notifyAdmin(client, reviewerId, 'Partner application assigned to you',
      `${application.company_name} (${application.reference_code}) was assigned to you for review.`, id);
    await client.query('COMMIT');
    return res.json({ message: 'Reviewer assigned.', application });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Assign reviewer error:', err);
    return res.status(500).json({ error: 'Could not assign reviewer.' });
  } finally {
    client.release();
  }
}

// POST /api/admin/partners/:id/notes — internal discussion thread,
// separate from the single `review_notes` a decision carries.
export async function addNote(req, res) {
  const { id } = req.params;
  const { note } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: 'note is required.' });

  const exists = await query('SELECT id FROM partner_applications WHERE id = $1', [id]);
  if (exists.rows.length === 0) return res.status(404).json({ error: 'Application not found.' });

  const result = await query(
    `INSERT INTO partner_application_notes (application_id, author_id, note) VALUES ($1,$2,$3) RETURNING *`,
    [id, req.user.id, note.trim()]
  );
  await query(
    `INSERT INTO partner_application_audit_log (application_id, admin_id, action, notes) VALUES ($1,$2,'note_added',$3)`,
    [id, req.user.id, note.trim()]
  );
  return res.status(201).json({ note: result.rows[0] });
}

// PATCH /api/admin/partners/:id/suspend and /reactivate — Super Admin
// only, for an already-approved partnership rather than an in-flight
// application.
export async function suspendPartnership(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await applyStatusChange(client, { applicationId: id, newStatus: 'suspended', notes: reason, adminId: req.user.id });
    if (!result) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Application not found.' }); }
    await client.query(
      `UPDATE partner_applications SET suspended_at = now(), suspended_reason = $1 WHERE id = $2`,
      [reason || null, id]
    );
    if (result.application.partner_user_id) {
      await client.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [result.application.partner_user_id]);
    }
    await client.query('COMMIT');
    sendPartnerApplicationDecisionEmail(result.application.business_email, {
      companyName: result.application.company_name, referenceCode: result.application.reference_code,
      status: 'suspended', notes: reason
    }).catch((err) => console.error('Partner suspension email error:', err));
    return res.json({ message: 'Partnership suspended.', application: result.application });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Suspend partnership error:', err);
    return res.status(500).json({ error: 'Could not suspend the partnership.' });
  } finally {
    client.release();
  }
}

export async function reactivatePartnership(req, res) {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await applyStatusChange(client, { applicationId: id, newStatus: 'approved', notes: 'Reactivated by Super Admin.', adminId: req.user.id });
    if (!result) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Application not found.' }); }
    await client.query(`UPDATE partner_applications SET suspended_at = NULL, suspended_reason = NULL WHERE id = $1`, [id]);
    await provisionPartnerAccount(client, result.application);
    await client.query('COMMIT');
    return res.json({ message: 'Partnership reactivated.', application: result.application });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reactivate partnership error:', err);
    return res.status(500).json({ error: 'Could not reactivate the partnership.' });
  } finally {
    client.release();
  }
}

// ===== Admin: review sensitive company-info change requests submitted by
// partners from the portal (see partnerPortalController.requestProfileChange) =====
export async function listProfileChangeRequests(req, res) {
  const { status = 'pending' } = req.query;
  const result = await query(
    `SELECT r.*, a.company_name, a.reference_code
     FROM partner_profile_change_requests r
     JOIN partner_applications a ON a.id = r.application_id
     WHERE r.status = $1 ORDER BY r.created_at DESC`,
    [status]
  );
  res.json({ changeRequests: result.rows });
}

export async function reviewProfileChangeRequest(req, res) {
  const { id } = req.params;
  const { decision, notes } = req.body; // 'approve' | 'reject'
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approve' or 'reject'." });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changeResult = await client.query('SELECT * FROM partner_profile_change_requests WHERE id = $1 FOR UPDATE', [id]);
    if (changeResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Change request not found.' }); }
    const changeRequest = changeResult.rows[0];
    if (changeRequest.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This change request has already been reviewed.' });
    }

    if (decision === 'approve') {
      const setClauses = [];
      const values = [];
      let i = 1;
      for (const [field, { to }] of Object.entries(changeRequest.changes)) {
        setClauses.push(`${field} = $${i}`);
        values.push(to);
        i += 1;
      }
      values.push(changeRequest.application_id);
      await client.query(`UPDATE partner_applications SET ${setClauses.join(', ')} WHERE id = $${i}`, values);
    }

    await client.query(
      `UPDATE partner_profile_change_requests SET status = $1, reviewed_by = $2, reviewed_at = now(), review_notes = $3 WHERE id = $4`,
      [decision === 'approve' ? 'approved' : 'rejected', req.user.id, notes || null, id]
    );

    const application = await client.query('SELECT partner_user_id, company_name FROM partner_applications WHERE id = $1', [changeRequest.application_id]);
    if (application.rows[0]?.partner_user_id) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'partner_update',$2,$3,$4)`,
        [
          application.rows[0].partner_user_id,
          `Company info change ${decision === 'approve' ? 'approved' : 'rejected'}`,
          `Your requested change to ${Object.keys(changeRequest.changes).join(', ')} was ${decision === 'approve' ? 'approved' : 'rejected'}.${notes ? ` ${notes}` : ''}`,
          { changeRequestId: id }
        ]
      );
    }
    await client.query(
      `INSERT INTO partner_portal_audit_log (application_id, actor_id, actor_role, action, details)
       VALUES ($1,$2,'admin',$3,$4)`,
      [changeRequest.application_id, req.user.id, `profile_change_${decision === 'approve' ? 'approved' : 'rejected'}`, { changeRequestId: id, notes: notes || null }]
    );

    await client.query('COMMIT');
    res.json({ message: `Change request ${decision === 'approve' ? 'approved' : 'rejected'}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Review profile change request error:', err);
    res.status(500).json({ error: 'Could not review the change request.' });
  } finally {
    client.release();
  }
}

// ===== Admin: list, view =====
export async function listApplications(req, res) {
  const {
    status, search, partnerType, country, assignedReviewerId,
    page = 1, pageSize = 50, sortBy = 'created_at', sortDir = 'desc'
  } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`status = $${i}`); values.push(status); i += 1; }
  if (partnerType) { conditions.push(`partner_type = $${i}`); values.push(partnerType); i += 1; }
  if (country) { conditions.push(`country = $${i}`); values.push(country); i += 1; }
  if (assignedReviewerId) { conditions.push(`assigned_reviewer_id = $${i}`); values.push(assignedReviewerId); i += 1; }
  if (search) {
    conditions.push(`(company_name ILIKE $${i} OR business_email ILIKE $${i} OR reference_code ILIKE $${i} OR contact_full_name ILIKE $${i})`);
    values.push(`%${search}%`);
    i += 1;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const SORTABLE = new Set(['created_at', 'company_name', 'partner_type', 'country', 'status']);
  const sortColumn = SORTABLE.has(sortBy) ? sortBy : 'created_at';
  const sortDirection = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const limit = Math.min(Number(pageSize) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [result, countResult] = await Promise.all([
    query(
      `SELECT a.id, a.reference_code, a.company_name, a.partner_type, a.country, a.contact_full_name,
              a.business_email, a.status, a.created_at, a.assigned_reviewer_id,
              r.username AS assigned_reviewer_name
       FROM partner_applications a
       LEFT JOIN users r ON r.id = a.assigned_reviewer_id
       ${where} ORDER BY a.${sortColumn} ${sortDirection} LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM partner_applications ${where}`, values),
  ]);
  res.json({ applications: result.rows, total: Number(countResult.rows[0].count), page: Number(page), pageSize: limit });
}

// GET /api/admin/partners/export — CSV of the same filtered set as
// listApplications (minus pagination), for the "Export" action.
export async function exportApplications(req, res) {
  const { status, search, partnerType, country } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`status = $${i}`); values.push(status); i += 1; }
  if (partnerType) { conditions.push(`partner_type = $${i}`); values.push(partnerType); i += 1; }
  if (country) { conditions.push(`country = $${i}`); values.push(country); i += 1; }
  if (search) {
    conditions.push(`(company_name ILIKE $${i} OR business_email ILIKE $${i} OR reference_code ILIKE $${i})`);
    values.push(`%${search}%`);
    i += 1;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT reference_code, company_name, partner_type, country, contact_full_name, business_email, status, created_at
     FROM partner_applications ${where} ORDER BY created_at DESC`,
    values
  );

  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Reference', 'Company Name', 'Partner Type', 'Country', 'Contact Person', 'Business Email', 'Status', 'Date Submitted'];
  const rows = result.rows.map((r) => [
    r.reference_code, r.company_name, r.partner_type, r.country, r.contact_full_name,
    r.business_email, STATUS_LABELS[r.status] || r.status, r.created_at.toISOString()
  ].map(escape).join(','));
  const csv = [header.map(escape).join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="partner-applications-${Date.now()}.csv"`);
  return res.send(csv);
}

// GET /api/admin/partners/reviewers — for the "Assign Reviewer" dropdown.
// Deliberately separate from the existing super-admin-only
// /api/admin/roles/admins endpoint: any admin with partners permission
// (not just Super Admin) needs to see who they can hand an application to.
export async function listEligibleReviewers(req, res) {
  const result = await query(
    `SELECT id, username, full_name, admin_role FROM users WHERE is_admin = TRUE ORDER BY username ASC`
  );
  res.json({ reviewers: result.rows });
}

export async function getApplicationDetail(req, res) {
  const { id } = req.params;
  const [appResult, docsResult, notesResult, auditResult] = await Promise.all([
    query(
      `SELECT a.*, r.username AS assigned_reviewer_name
       FROM partner_applications a LEFT JOIN users r ON r.id = a.assigned_reviewer_id
       WHERE a.id = $1`,
      [id]
    ),
    query(
      'SELECT id, doc_type, file_name, file_url, bytes, created_at FROM partner_application_documents WHERE application_id = $1 ORDER BY created_at ASC',
      [id]
    ),
    query(
      `SELECT n.id, n.note, n.created_at, u.username AS author_name
       FROM partner_application_notes n LEFT JOIN users u ON u.id = n.author_id
       WHERE n.application_id = $1 ORDER BY n.created_at DESC`,
      [id]
    ),
    query(
      `SELECT l.id, l.action, l.previous_status, l.new_status, l.notes, l.created_at, u.username AS admin_name
       FROM partner_application_audit_log l LEFT JOIN users u ON u.id = l.admin_id
       WHERE l.application_id = $1 ORDER BY l.created_at DESC`,
      [id]
    )
  ]);
  if (appResult.rows.length === 0) return res.status(404).json({ error: 'Application not found.' });
  res.json({
    application: appResult.rows[0],
    documents: docsResult.rows,
    notes: notesResult.rows,
    auditLog: auditResult.rows
  });
}
