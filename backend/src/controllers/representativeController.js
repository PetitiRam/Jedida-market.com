// Jedida Market Representatives.
//
// A Market Representative is an approved Jedida agent (an admin account
// with admin_role = 'business_rep', see middleware/auth.js) who helps
// Manufacturers, Suppliers, Sellers and Dropshippers onboard and manage
// their presence on Jedida. Reps have deliberately narrow permissions —
// see the CHECK constraint on market_representatives and every guard
// below: they can look at and help with a business's storefront/catalog,
// never touch money, orders, or ownership.

import { query } from '../config/db.js';
import { logSecurityEvent } from '../services/securityLogService.js';

async function nextRepCode() {
  const result = await query(`SELECT nextval('rep_code_seq') AS n`);
  return `REP-${String(result.rows[0].n).padStart(4, '0')}`;
}

// ===========================================================================
// ADMIN: roster management
// ===========================================================================

// Promotes an existing user to Market Representative: grants the
// business_rep admin sub-role (same mechanism as adminController's other
// admin-role grants) and creates the roster row that tracks assignments.
export async function createRepresentative(req, res) {
  const { userId, specialties, bio } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required.' });

  const userResult = await query('SELECT id, full_name, is_admin, admin_role FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const existing = await query('SELECT id FROM market_representatives WHERE user_id = $1', [userId]);
  if (existing.rows[0]) return res.status(409).json({ error: 'This user is already a Market Representative.' });

  const repCode = await nextRepCode();

  await query('UPDATE users SET is_admin = TRUE, admin_role = $1 WHERE id = $2', ['business_rep', userId]);
  await query('INSERT INTO admin_assignments (user_id, assigned_by, role) VALUES ($1,$2,$3)', [userId, req.user.id, 'business_rep']);

  const result = await query(
    `INSERT INTO market_representatives (user_id, rep_code, specialties, bio, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, repCode, specialties || [], bio || null, req.user.id]
  );

  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: req.user.adminRole || 'super_admin', eventType: 'representative_created',
    entityType: 'market_representative', entityId: result.rows[0].id,
    metadata: { userId, repCode },
  });

  res.status(201).json({ representative: result.rows[0] });
}

export async function listRepresentatives(req, res) {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE r.status = $${params.length}`; }
  const result = await query(
    `SELECT r.*, u.full_name, u.email,
            (SELECT COUNT(*) FROM representative_assignments a WHERE a.representative_id = r.id AND a.status = 'active') AS active_assignments
     FROM market_representatives r
     JOIN users u ON u.id = r.user_id
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );
  res.json({ representatives: result.rows });
}

export async function updateRepresentativeStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body; // active | suspended
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'status must be "active" or "suspended".' });
  }
  const result = await query('UPDATE market_representatives SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Representative not found.' });

  // A suspended representative previously kept full business_rep admin
  // access — the roster row said "suspended" but the account could still
  // sign in to the admin console. Suspending now actually pulls admin
  // access; reactivating restores it (this route already requires super
  // admin, same as any other admin-access grant).
  if (status === 'suspended') {
    await query(`UPDATE users SET is_admin = FALSE, admin_role = NULL WHERE id = $1 AND admin_role = 'business_rep'`, [result.rows[0].user_id]);
  } else {
    await query(`UPDATE users SET is_admin = TRUE, admin_role = 'business_rep' WHERE id = $1`, [result.rows[0].user_id]);
  }

  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: req.user.adminRole || 'super_admin', eventType: 'representative_status_changed',
    entityType: 'market_representative', entityId: id, metadata: { status, userId: result.rows[0].user_id },
  });

  res.json({ representative: result.rows[0] });
}

export async function assignRepresentative(req, res) {
  const { id } = req.params; // representative id
  const { businessUserId, notes } = req.body;
  if (!businessUserId) return res.status(400).json({ error: 'businessUserId is required.' });

  const rep = (await query('SELECT * FROM market_representatives WHERE id = $1', [id])).rows[0];
  if (!rep) return res.status(404).json({ error: 'Representative not found.' });
  if (rep.status !== 'active') return res.status(400).json({ error: 'This representative is suspended and cannot take new assignments.' });

  const business = (await query(
    `SELECT id, full_name, primary_role FROM users WHERE id = $1 AND primary_role IN ('manufacturer','supplier','dropshipper','seller')`,
    [businessUserId]
  )).rows[0];
  if (!business) return res.status(404).json({ error: 'Business account not found (must be a manufacturer, supplier, dropshipper, or seller).' });

  const result = await query(
    `INSERT INTO representative_assignments (representative_id, business_user_id, assigned_by, notes)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, businessUserId, req.user.id, notes || null]
  );

  await query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'representative_assigned', 'A Jedida Representative has been assigned to you', $2)`,
    [businessUserId, `${rep.rep_code} is now your Jedida Market Representative and can help with store setup, catalog management, and training.`]
  );

  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: 'admin', eventType: 'representative_assigned',
    entityType: 'representative_assignment', entityId: result.rows[0].id,
    metadata: { representativeId: id, businessUserId },
  });

  res.status(201).json({ assignment: result.rows[0] });
}

export async function endAssignment(req, res) {
  const { assignmentId } = req.params;
  const result = await query(
    `UPDATE representative_assignments SET status = 'ended', ended_at = now()
     WHERE id = $1 AND status = 'active' RETURNING *`,
    [assignmentId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Active assignment not found.' });

  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: 'admin', eventType: 'representative_assignment_ended',
    entityType: 'representative_assignment', entityId: assignmentId, metadata: {},
  });

  res.json({ message: 'Assignment ended.', assignment: result.rows[0] });
}

export async function listAllAssignments(req, res) {
  const result = await query(
    `SELECT a.*, r.rep_code, ru.full_name AS representative_name,
            bu.full_name AS business_name, bu.primary_role AS business_role
     FROM representative_assignments a
     JOIN market_representatives r ON r.id = a.representative_id
     JOIN users ru ON ru.id = r.user_id
     JOIN users bu ON bu.id = a.business_user_id
     ORDER BY a.assigned_at DESC LIMIT 200`
  );
  res.json({ assignments: result.rows });
}

export async function listEscalations(req, res) {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE e.status = $${params.length}`; }
  const result = await query(
    `SELECT e.*, r.rep_code, ru.full_name AS representative_name, bu.full_name AS business_name
     FROM representative_escalations e
     JOIN market_representatives r ON r.id = e.representative_id
     JOIN users ru ON ru.id = r.user_id
     LEFT JOIN users bu ON bu.id = e.business_user_id
     ${where}
     ORDER BY e.created_at DESC LIMIT 200`,
    params
  );
  res.json({ escalations: result.rows });
}

export async function resolveEscalation(req, res) {
  const { id } = req.params;
  const { resolutionNotes } = req.body;
  const result = await query(
    `UPDATE representative_escalations SET status = 'resolved', resolved_by = $2, resolved_at = now(), resolution_notes = $3
     WHERE id = $1 RETURNING *`,
    [id, req.user.id, resolutionNotes || null]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Escalation not found.' });
  res.json({ escalation: result.rows[0] });
}

// ===========================================================================
// REPRESENTATIVE SELF-SERVICE — requires the signed-in admin to hold an
// active market_representatives row (see requireActiveRepresentative below).
// Every read is scoped to businesses actually assigned to this rep;
// every write is logged and stays inside the "helps, never transacts" set
// of capabilities from the spec.
// ===========================================================================

// Attaches req.representative if the signed-in admin is an active rep.
// Mounted as middleware on the /representatives/me/* routes.
export async function requireActiveRepresentative(req, res, next) {
  const result = await query('SELECT * FROM market_representatives WHERE user_id = $1', [req.user.id]);
  const rep = result.rows[0];
  if (!rep) return res.status(403).json({ error: 'You are not registered as a Jedida Market Representative.' });
  if (rep.status !== 'active') return res.status(403).json({ error: 'Your Market Representative access is currently suspended.' });
  req.representative = rep;
  next();
}

async function assertAssigned(representativeId, businessUserId) {
  const result = await query(
    `SELECT 1 FROM representative_assignments WHERE representative_id = $1 AND business_user_id = $2 AND status = 'active'`,
    [representativeId, businessUserId]
  );
  return !!result.rows[0];
}

export async function myAssignments(req, res) {
  const result = await query(
    `SELECT a.*, bu.full_name AS business_name, bu.primary_role AS business_role, bu.email
     FROM representative_assignments a
     JOIN users bu ON bu.id = a.business_user_id
     WHERE a.representative_id = $1 AND a.status = 'active'
     ORDER BY a.assigned_at DESC`,
    [req.representative.id]
  );
  res.json({ assignments: result.rows });
}

// Read-only account-health snapshot for an assigned business — storefront
// status, catalog size, verification status. Deliberately excludes wallet
// balances, payout history, and any financial figures: "cannot access
// confidential financial information without permission" is enforced by
// simply never selecting those columns here.
export async function businessOverview(req, res) {
  const { businessUserId } = req.params;
  if (!(await assertAssigned(req.representative.id, businessUserId))) {
    return res.status(403).json({ error: 'You are not assigned to this business.' });
  }

  const [userRes, shopRes, profileRes, productsRes] = await Promise.all([
    query('SELECT id, full_name, email, primary_role, status, created_at FROM users WHERE id = $1', [businessUserId]),
    query('SELECT id, name, slug, description, status, created_at FROM shops WHERE owner_id = $1', [businessUserId]),
    query('SELECT id, business_type, company_name, status, verification_level FROM business_profiles WHERE user_id = $1', [businessUserId]),
    query(`SELECT COUNT(*) AS count FROM products p JOIN shops s ON s.id = p.shop_id WHERE s.owner_id = $1`, [businessUserId]),
  ]);

  if (!userRes.rows[0]) return res.status(404).json({ error: 'Business account not found.' });

  res.json({
    account: userRes.rows[0],
    shop: shopRes.rows[0] || null,
    businessProfile: profileRes.rows[0] || null,
    productCount: Number(productsRes.rows[0]?.count || 0),
  });
}

// Logs a help/training session or catalog/category assist so it shows up
// on the business's account timeline for Admin — covers "train businesses",
// "help upload products", "organize product categories", "support store
// optimization", "monitor account health" from the spec, all as an
// auditable note rather than a mutating action (product/category writes
// themselves still go through the business's own products/shops routes,
// where a rep can already act on the owner's behalf if given portal access —
// this endpoint is the record of assistance given, not a new write path).
export async function logActivity(req, res) {
  const { businessUserId } = req.params;
  const { activityType, notes } = req.body;
  if (!(await assertAssigned(req.representative.id, businessUserId))) {
    return res.status(403).json({ error: 'You are not assigned to this business.' });
  }
  const ALLOWED_TYPES = [
    'store_setup', 'catalog_setup', 'business_verification_help', 'training',
    'product_upload_help', 'category_organization', 'store_optimization', 'account_health_check',
  ];
  if (!ALLOWED_TYPES.includes(activityType)) {
    return res.status(400).json({ error: `activityType must be one of: ${ALLOWED_TYPES.join(', ')}.` });
  }
  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: 'business_rep', eventType: `rep_${activityType}`,
    entityType: 'business', entityId: businessUserId,
    metadata: { notes: notes || null, representativeId: req.representative.id },
  });
  res.status(201).json({ message: 'Activity logged.' });
}

export async function createEscalation(req, res) {
  const { businessUserId, area, subject, details } = req.body;
  if (!subject?.trim() || !details?.trim()) {
    return res.status(400).json({ error: 'subject and details are required.' });
  }
  if (businessUserId && !(await assertAssigned(req.representative.id, businessUserId))) {
    return res.status(403).json({ error: 'You are not assigned to this business.' });
  }
  const result = await query(
    `INSERT INTO representative_escalations (representative_id, business_user_id, area, subject, details)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.representative.id, businessUserId || null, area || 'other', subject.trim(), details.trim()]
  );
  res.status(201).json({ escalation: result.rows[0] });
}
