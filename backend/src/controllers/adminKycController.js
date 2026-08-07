import { query } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';

const STATUS_COUNT_LIST = ['pending', 'manual_review', 'approved', 'rejected', 'draft'];

// GET /admin/kyc-review/stats — counts for the dashboard sidebar.
export async function getStats(req, res) {
  try {
    const result = await query(
      `SELECT status, COUNT(*)::int AS count FROM kyc_submissions
       WHERE status != 'draft' GROUP BY status`
    );
    const counts = Object.fromEntries(STATUS_COUNT_LIST.map((s) => [s, 0]));
    result.rows.forEach((r) => { counts[r.status] = r.count; });
    res.json({ counts });
  } catch (err) {
    console.error('KYC stats error:', err);
    res.status(500).json({ error: 'Could not load KYC stats.' });
  }
}

// GET /admin/kyc-review/submissions?status=&search=&assignedTo=&page=
export async function listSubmissions(req, res) {
  const { status, search, assignedTo, page = 1, pageSize = 20 } = req.query;
  const conditions = [`k.status != 'draft'`];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`k.status = $${idx}`); params.push(status); idx += 1; }
  if (assignedTo) { conditions.push(`k.assigned_to = $${idx}`); params.push(assignedTo); idx += 1; }
  if (search) {
    conditions.push(`(u.full_name ILIKE $${idx} OR u.email ILIKE $${idx} OR k.national_id_number ILIKE $${idx} OR k.id::text = $${idx + 1})`);
    params.push(`%${search}%`, search);
    idx += 2;
  }

  const offset = (Number(page) - 1) * Number(pageSize);
  try {
    const result = await query(
      `SELECT k.id, k.user_id, k.status, k.full_name, k.national_id_number, k.created_at, k.updated_at,
              k.current_step, k.assigned_to, k.risk_flags, k.face_check, k.documents,
              u.full_name AS account_full_name, u.email, u.phone, u.primary_role
       FROM kyc_submissions k
       JOIN users u ON u.id = k.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY k.created_at DESC
       LIMIT ${Number(pageSize)} OFFSET ${offset}`,
      params
    );
    res.json({ submissions: result.rows });
  } catch (err) {
    console.error('List KYC submissions error:', err);
    res.status(500).json({ error: 'Could not load KYC submissions.' });
  }
}

// GET /admin/kyc-review/submissions/:id
export async function getSubmission(req, res) {
  try {
    const result = await query(
      `SELECT k.*, u.full_name AS account_full_name, u.email, u.phone, u.primary_role, u.created_at AS user_created_at
       FROM kyc_submissions k JOIN users u ON u.id = k.user_id
       WHERE k.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });
    res.json({ submission: result.rows[0] });
  } catch (err) {
    console.error('Get KYC submission error:', err);
    res.status(500).json({ error: 'Could not load this submission.' });
  }
}

const VALID_ACTIONS = ['approve', 'reject', 'request_info', 'suspend', 'escalate', 'assign'];

// PATCH /admin/kyc-review/submissions/:id — body: { action, notes, assignTo }
export async function reviewSubmission(req, res) {
  const { id } = req.params;
  const { action, notes, assignTo } = req.body;
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
  }

  const statusByAction = {
    approve: 'approved',
    reject: 'rejected',
    request_info: 'manual_review',
    suspend: 'rejected', // suspension is modeled as a rejected KYC + separate account suspension (see updateUserStatus)
    escalate: 'manual_review',
    assign: null, // no status change, just reassigns the reviewer
  };

  try {
    const existing = await query(`SELECT * FROM kyc_submissions WHERE id = $1`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });
    const submission = existing.rows[0];

    const activityEntry = {
      action,
      by: req.user.id,
      at: new Date().toISOString(),
      notes: notes || null,
    };

    const newStatus = statusByAction[action];
    const sets = [`activity_log = activity_log || $1::jsonb`];
    const values = [JSON.stringify([activityEntry])];
    let idx = 2;

    if (newStatus) {
      sets.push(`status = $${idx}`); values.push(newStatus); idx += 1;
      sets.push(`reviewed_by = $${idx}`); values.push(req.user.id); idx += 1;
      sets.push(`reviewed_at = now()`);
    }
    if (notes) {
      sets.push(`reviewer_notes = $${idx}`); values.push(notes); idx += 1;
    }
    if (action === 'assign' && assignTo) {
      sets.push(`assigned_to = $${idx}`); values.push(assignTo); idx += 1;
    }
    sets.push(`updated_at = now()`);

    values.push(id);
    const result = await query(
      `UPDATE kyc_submissions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (newStatus) {
      await query(`UPDATE users SET kyc_status = $1 WHERE id = $2`, [
        newStatus === 'manual_review' ? 'pending' : newStatus,
        submission.user_id,
      ]);
      const messageByAction = {
        approve: 'Your identity verification was approved.',
        reject: 'Your identity verification was rejected. Please review and resubmit.',
        request_info: 'We need additional information to complete your verification.',
        suspend: 'Your account verification has been suspended pending review.',
        escalate: 'Your verification has been escalated for further review.',
      };
      await query(
        `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'kyc_update','KYC review update',$2,$3)`,
        [submission.user_id, messageByAction[action] || 'Your KYC status was updated.', req.user.id]
      );
    }

    await logSecurityEvent(null, {
      actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
      eventType: `kyc_${action}`, entityType: 'kyc_submission', entityId: id,
      metadata: { submissionUserId: submission.user_id, notes: notes || null, ip: req.ip },
    });

    res.json({ submission: result.rows[0] });
  } catch (err) {
    console.error('Review KYC submission error:', err);
    res.status(500).json({ error: 'Could not update this submission.' });
  }
}

// POST /admin/kyc-review/submissions/:id/notes — body: { note }
export async function addNote(req, res) {
  const { note } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'Note text is required.' });
  try {
    const entry = { note, by: req.user.id, at: new Date().toISOString() };
    const result = await query(
      `UPDATE kyc_submissions SET internal_notes = internal_notes || $1::jsonb, updated_at = now()
       WHERE id = $2 RETURNING internal_notes`,
      [JSON.stringify([entry]), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });
    res.json({ internalNotes: result.rows[0].internal_notes });
  } catch (err) {
    console.error('Add KYC note error:', err);
    res.status(500).json({ error: 'Could not save note.' });
  }
}
