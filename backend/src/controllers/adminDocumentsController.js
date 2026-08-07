import { query } from '../config/db.js';

export async function listDocuments(req, res) {
  try {
    const { type, status, q, from, to, limit } = req.query;
    const params = [];
    let sql = 'SELECT * FROM documents WHERE 1=1';
    if (type) { params.push(type); sql += ` AND document_type = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND document_number ILIKE $${params.length}`; }
    if (from) { params.push(from); sql += ` AND created_at >= $${params.length}`; }
    if (to) { params.push(to); sql += ` AND created_at <= $${params.length}`; }
    params.push(Math.min(Number(limit) || 100, 500));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const result = await query(sql, params);
    return res.json({ documents: result.rows });
  } catch (err) {
    console.error('Admin list documents error:', err);
    return res.status(500).json({ error: 'Could not load documents.' });
  }
}

export async function getDocument(req, res) {
  try {
    const doc = await query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!doc.rows[0]) return res.status(404).json({ error: 'Document not found.' });
    const items = await query('SELECT * FROM document_line_items WHERE document_id = $1 ORDER BY sort_order', [req.params.id]);
    const scans = await query('SELECT * FROM document_verification_scans WHERE document_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]);
    const disputes = await query('SELECT * FROM document_disputes WHERE document_id = $1 ORDER BY created_at DESC', [req.params.id]);
    return res.json({ document: doc.rows[0], items: items.rows, scans: scans.rows, disputes: disputes.rows });
  } catch (err) {
    console.error('Admin get document error:', err);
    return res.status(500).json({ error: 'Could not load document.' });
  }
}

// Admin explicitly marking a document as reviewed/verified — distinct from
// the automatic buyer-facing QR verification, this is an audit action.
export async function markVerifiedByAdmin(req, res) {
  try {
    const updated = await query(
      `UPDATE documents SET metadata = metadata || '{"admin_verified":true}'::jsonb WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Document not found.' });
    if (updated.rows[0].recipient_id) {
      await query(
        `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'document_verified_by_admin','Document verified',$2)`,
        [updated.rows[0].recipient_id, `${updated.rows[0].document_number} was reviewed and verified by Jedida admin.`]
      );
    }
    return res.json({ message: 'Document marked as verified.', document: updated.rows[0] });
  } catch (err) {
    console.error('Admin verify document error:', err);
    return res.status(500).json({ error: 'Could not verify document.' });
  }
}

// Fraud control — voids a document so it fails QR verification.
export async function voidDocument(req, res) {
  try {
    const { reason } = req.body || {};
    const updated = await query(
      `UPDATE documents SET status = 'void', metadata = metadata || $2::jsonb WHERE id = $1 RETURNING *`,
      [req.params.id, JSON.stringify({ voided_reason: reason || 'Voided by admin', voided_by: req.user.id })]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Document not found.' });
    return res.json({ message: 'Document voided.', document: updated.rows[0] });
  } catch (err) {
    console.error('Admin void document error:', err);
    return res.status(500).json({ error: 'Could not void document.' });
  }
}

export async function listDisputes(req, res) {
  try {
    const { status } = req.query;
    const params = [];
    let sql = `SELECT dd.*, d.document_number, d.document_type, d.total_amount, d.currency
               FROM document_disputes dd JOIN documents d ON d.id = dd.document_id WHERE 1=1`;
    if (status) { params.push(status); sql += ` AND dd.status = $${params.length}`; }
    sql += ' ORDER BY dd.created_at DESC LIMIT 300';
    const result = await query(sql, params);
    return res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Admin list disputes error:', err);
    return res.status(500).json({ error: 'Could not load disputes.' });
  }
}

export async function resolveDispute(req, res) {
  try {
    const { status, adminNotes } = req.body;
    if (!['reviewing', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const updated = await query(
      `UPDATE document_disputes SET status = $1, admin_notes = $2,
         resolved_by = CASE WHEN $1 IN ('resolved','dismissed') THEN $3 ELSE resolved_by END,
         resolved_at = CASE WHEN $1 IN ('resolved','dismissed') THEN now() ELSE resolved_at END
       WHERE id = $4 RETURNING *`,
      [status, adminNotes || null, req.user.id, req.params.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Dispute not found.' });
    return res.json({ message: 'Dispute updated.', dispute: updated.rows[0] });
  } catch (err) {
    console.error('Admin resolve dispute error:', err);
    return res.status(500).json({ error: 'Could not update dispute.' });
  }
}

// Quick audit dashboard numbers: totals per type/status, recent fraud flags.
export async function auditSummary(req, res) {
  try {
    const totals = await query(
      `SELECT document_type, status, COUNT(*)::int AS count, COALESCE(SUM(total_amount),0) AS total
       FROM documents GROUP BY document_type, status ORDER BY document_type`
    );
    const openDisputes = await query(`SELECT COUNT(*)::int AS count FROM document_disputes WHERE status = 'open'`);
    const recentScans = await query(
      `SELECT result, COUNT(*)::int AS count FROM document_verification_scans
       WHERE created_at > now() - interval '7 days' GROUP BY result`
    );
    return res.json({ totals: totals.rows, openDisputes: openDisputes.rows[0].count, recentScans: recentScans.rows });
  } catch (err) {
    console.error('Admin audit summary error:', err);
    return res.status(500).json({ error: 'Could not build audit summary.' });
  }
}
