import { query } from '../config/db.js';
import { invalidateSettingsCache } from './ordersController.js';
import { logSecurityEvent } from '../services/securityLogService.js';
import { ADMIN_ROLE_PERMISSIONS, isSuperAdminAccount, roleWithinGrantersScope } from '../middleware/auth.js';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_RISK, AREA_LABELS } from '../constants/adminRoleMeta.js';

export async function listUsers(req, res) {
  const { role, status, search, page = 1, pageSize = 50 } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (role) { conditions.push(`primary_role = $${i}`); values.push(role); i += 1; }
  if (status) { conditions.push(`status = $${i}`); values.push(status); i += 1; }
  if (search) {
    conditions.push(`(full_name ILIKE $${i} OR email ILIKE $${i} OR phone_number ILIKE $${i} OR user_number::text = $${i + 1})`);
    values.push(`%${search}%`, search);
    i += 2;
  }
  // "Lower administrators must never see Super Administrator accounts" —
  // a caller who isn't a super admin never gets those rows back, at the
  // query level, not just hidden in the UI.
  const isCallerSuperAdmin = !req.user.adminRole || req.user.adminRole === 'super_admin';
  if (!isCallerSuperAdmin) {
    conditions.push(`NOT (is_admin = TRUE AND (admin_role IS NULL OR admin_role = 'super_admin'))`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(pageSize) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [result, countResult] = await Promise.all([
    query(
      `SELECT id, user_number, email, full_name, phone_number, location_country, primary_role, is_admin, admin_role, status,
              is_verified, kyc_status, created_at
       FROM users ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM users ${where}`, values),
  ]);

  res.json({ users: result.rows, total: Number(countResult.rows[0].count), page: Number(page), pageSize: limit });
}

// Full profile for the admin user-detail view: core record + their shop (if
// any), upgrade history, and KYC documents in one call.
export async function getUserDetail(req, res) {
  const { userId } = req.params;
  const [userResult, shopResult, upgradesResult, kycResult] = await Promise.all([
    query(
      `SELECT id, user_number, email, username, full_name, phone_number, primary_role, is_admin, admin_role,
              status, is_verified, kyc_status, location_city, location_country, created_at
       FROM users WHERE id = $1`,
      [userId]
    ),
    query(`SELECT id, name, slug, status FROM shops WHERE owner_id = $1`, [userId]),
    query(`SELECT id, requested_role, status, created_at, reviewed_at FROM role_upgrades WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
    query(`SELECT id, status, document_type, reviewer_notes, created_at, reviewed_at FROM kyc_submissions WHERE user_id = $1 ORDER BY created_at DESC`, [userId]),
  ]);

  if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

  const targetUser = userResult.rows[0];
  const isCallerSuperAdmin = !req.user.adminRole || req.user.adminRole === 'super_admin';
  if (!isCallerSuperAdmin && isSuperAdminAccount(targetUser)) {
    // Same rule as listUsers, applied to the direct-lookup path too — a
    // non-super-admin can't route around the list filter by guessing an ID.
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({
    user: targetUser,
    shop: shopResult.rows[0] || null,
    upgrades: upgradesResult.rows,
    kycDocuments: kycResult.rows,
  });
}

export async function updateUserStatus(req, res) {
  const { userId } = req.params;
  const { status } = req.body; // active | suspended | rejected

  const isCallerSuperAdmin = !req.user.adminRole || req.user.adminRole === 'super_admin';
  if (!isCallerSuperAdmin) {
    // A narrower admin sub-role (moderator/support/security_agent — the
    // only roles with 'users' access) can suspend ordinary accounts, but
    // must never be able to touch another admin account's status,
    // super admin or not — that's a privilege action reserved for super
    // admins, same as granting the role in the first place.
    const target = await query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (target.rows[0].is_admin) {
      return res.status(403).json({ error: 'Only a super admin can change the status of an admin account.' });
    }
  }

  const result = await query('UPDATE users SET status = $1 WHERE id = $2 RETURNING id, status', [status, userId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
    eventType: 'user_status_changed', entityType: 'user', entityId: userId,
    metadata: { newStatus: status, ip: req.ip },
  });
  res.json({ message: 'User status updated.', user: result.rows[0] });
}

const ADMIN_ROLES = Object.keys(ADMIN_ROLE_PERMISSIONS);

export async function assignAdminRole(req, res) {
  const { userId } = req.params;
  const { role } = req.body;
  if (role && !ADMIN_ROLES.includes(role)) {
    return res.status(400).json({ error: `Unknown admin role. Use one of: ${ADMIN_ROLES.join(', ')}.` });
  }
  // Defense in depth: "no administrator may create a role with
  // permissions greater than their own." The route already restricts
  // this endpoint to super admins (who always pass this check), but the
  // rule lives here too so it can't be silently lost if that route gate
  // is ever changed.
  if (!roleWithinGrantersScope(req.user.adminRole, role || 'super_admin')) {
    return res.status(403).json({ error: 'You cannot grant a role with permissions greater than your own.' });
  }
  await query('UPDATE users SET is_admin = TRUE, admin_role = $1 WHERE id = $2', [role || null, userId]);
  await query('INSERT INTO admin_assignments (user_id, assigned_by, role) VALUES ($1,$2,$3)', [userId, req.user.id, role || null]);
  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
    eventType: 'admin_role_granted', entityType: 'user', entityId: userId,
    metadata: { grantedRole: role || 'super_admin', ip: req.ip },
  });
  res.json({ message: role ? `User granted admin access as ${role}.` : 'User granted full admin access.' });
}

// There was previously no way to remove admin access once granted.
export async function revokeAdminRole(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot revoke your own admin access.' });
  }
  const result = await query('UPDATE users SET is_admin = FALSE, admin_role = NULL WHERE id = $1 RETURNING id, full_name', [userId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  await query('INSERT INTO admin_assignments (user_id, assigned_by, role) VALUES ($1,$2,NULL)', [userId, req.user.id]);
  await logSecurityEvent(null, {
    actorId: req.user.id, actorRole: req.user.adminRole || 'admin',
    eventType: 'admin_role_revoked', entityType: 'user', entityId: userId,
    metadata: { revokedUserName: result.rows[0].full_name, ip: req.ip },
  });
  res.json({ message: `Admin access revoked for ${result.rows[0].full_name}.` });
}

// Directory of everyone who currently has admin access, for the Roles &
// Permissions screen — previously the only way to see this was scrolling
// the full Users table looking for badges.
export async function listAdmins(req, res) {
  const result = await query(
    `SELECT u.id, u.user_number, u.full_name, u.email, u.admin_role,
            (SELECT MAX(aa.assigned_at) FROM admin_assignments aa WHERE aa.user_id = u.id AND aa.role IS NOT NULL) AS granted_at
     FROM users u WHERE u.is_admin = TRUE ORDER BY (u.admin_role = 'super_admin') DESC, u.full_name ASC`
  );
  res.json({ admins: result.rows });
}

// Every admin sub-role, the functional areas it actually grants (straight
// from the same ADMIN_ROLE_PERMISSIONS the auth middleware enforces — so
// this can never drift out of sync with what a role can really do), plus
// how many current admins hold each role. Powers the Roles & Permissions
// console; nothing here is hardcoded on the frontend.
export async function listAdminRoleDefinitions(req, res) {
  const counts = await query(
    `SELECT COALESCE(admin_role, 'super_admin') AS admin_role, COUNT(*) AS count
     FROM users WHERE is_admin = TRUE GROUP BY admin_role`
  );
  const countByRole = Object.fromEntries(counts.rows.map((r) => [r.admin_role, Number(r.count)]));

  const roles = Object.keys(ADMIN_ROLE_PERMISSIONS).map((role) => ({
    role,
    label: ROLE_LABELS[role] || role,
    description: ROLE_DESCRIPTIONS[role] || '',
    risk: ROLE_RISK[role] || 'medium',
    areas: ADMIN_ROLE_PERMISSIONS[role],
    adminCount: countByRole[role] || 0,
  }));

  res.json({
    roles,
    areaLabels: AREA_LABELS,
    totalAdmins: counts.rows.reduce((sum, r) => sum + Number(r.count), 0),
  });
}

// Recent role grants/revocations, for the console's activity feed — sourced
// directly from admin_assignments (written by assignAdminRole/revokeAdminRole
// above), not a mocked timeline.
export async function listRoleActivity(req, res) {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const result = await query(
    `SELECT aa.id, aa.role, aa.assigned_at,
            target.full_name AS target_name, target.id AS target_id,
            actor.full_name AS actor_name, actor.id AS actor_id
     FROM admin_assignments aa
     JOIN users target ON target.id = aa.user_id
     JOIN users actor ON actor.id = aa.assigned_by
     ORDER BY aa.assigned_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json({
    activity: result.rows.map((r) => ({
      id: r.id,
      role: r.role,
      action: r.role ? 'granted' : 'revoked',
      targetName: r.target_name,
      targetId: r.target_id,
      actorName: r.actor_name,
      actorId: r.actor_id,
      assignedAt: r.assigned_at,
    })),
  });
}

export async function listKycSubmissions(req, res) {
  const result = await query(
    `SELECT k.*, u.full_name, u.email FROM kyc_submissions k JOIN users u ON u.id = k.user_id
     WHERE k.status = 'pending' ORDER BY k.created_at DESC`
  );
  res.json({ submissions: result.rows });
}

export async function reviewKyc(req, res) {
  const { id } = req.params;
  const { decision, notes } = req.body; // approve | reject
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const result = await query(
    `UPDATE kyc_submissions SET status = $1, reviewed_by = $2, reviewer_notes = $3, reviewed_at = now() WHERE id = $4 RETURNING *`,
    [status, req.user.id, notes || null, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Submission not found.' });
  await query('UPDATE users SET kyc_status = $1 WHERE id = $2', [status, result.rows[0].user_id]);
  await query(
    `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'kyc_update','KYC review update',$2,$3)`,
    [result.rows[0].user_id, `Your KYC submission was ${status}.`, req.user.id]
  );
  res.json({ message: `KYC ${status}.` });
}

export async function listPendingShops(req, res) {
  const result = await query(`SELECT * FROM shops WHERE status = 'pending' ORDER BY created_at DESC`);
  res.json({ shops: result.rows });
}

// Full shop directory across every status — pending shops previously were
// the *only* shops an admin could see at all; there was no way to find,
// search, or suspend a shop once it was already live.
export async function listAllShops(req, res) {
  const { status, search, page = 1, pageSize = 50 } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;
  if (status) { conditions.push(`s.status = $${i}`); values.push(status); i += 1; }
  if (search) {
    conditions.push(`(s.name ILIKE $${i} OR u.email ILIKE $${i} OR u.full_name ILIKE $${i})`);
    values.push(`%${search}%`);
    i += 1;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(pageSize) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [result, countResult] = await Promise.all([
    query(
      `SELECT s.*, u.full_name AS owner_name, u.email AS owner_email
       FROM shops s JOIN users u ON u.id = s.owner_id
       ${where} ORDER BY s.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM shops s JOIN users u ON u.id = s.owner_id ${where}`, values),
  ]);
  res.json({ shops: result.rows, total: Number(countResult.rows[0].count), page: Number(page), pageSize: limit });
}

export async function reviewShop(req, res) {
  const { id } = req.params;
  const { decision, reason } = req.body;
  const status = decision === 'approve' ? 'active' : 'rejected';
  const result = await query('UPDATE shops SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Shop not found.' });
  const body = status === 'active'
    ? `Your shop "${result.rows[0].name}" was approved and is now live.`
    : `Your shop "${result.rows[0].name}" was rejected${reason ? `: ${reason}` : '.'}`;
  await query(
    `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,$2,$3,$4,$5)`,
    [result.rows[0].owner_id, status === 'active' ? 'shop_approved' : 'shop_rejected',
     status === 'active' ? 'Your shop is live!' : 'Shop rejected', body, req.user.id]
  );
  res.json({ message: `Shop ${status}.`, shop: result.rows[0] });
}

// Suspend or reactivate a shop that is already live — separate from the
// pending-approval flow above, which only ever touches shops with status
// 'pending'.
export async function updateShopStatus(req, res) {
  const { id } = req.params;
  const { status, reason } = req.body; // active | suspended
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or suspended.' });
  }
  const result = await query('UPDATE shops SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Shop not found.' });
  await query(
    `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,'shop_status_update',$2,$3,$4)`,
    [result.rows[0].owner_id, status === 'suspended' ? 'Your shop was suspended' : 'Your shop was reactivated',
     status === 'suspended' ? `Your shop "${result.rows[0].name}" was suspended${reason ? `: ${reason}` : '.'}` : `Your shop "${result.rows[0].name}" is active again.`,
     req.user.id]
  );
  res.json({ message: `Shop ${status}.`, shop: result.rows[0] });
}

export async function listPendingProducts(req, res) {
  const result = await query(
    `SELECT p.*, s.name AS shop_name FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'pending_review' ORDER BY p.created_at DESC`
  );
  res.json({ products: result.rows });
}

export async function reviewProduct(req, res) {
  const { id } = req.params;
  const { decision, reason } = req.body;
  const status = decision === 'approve' ? 'active' : 'rejected';
  const result = await query('UPDATE products SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
  const shop = await query('SELECT owner_id FROM shops WHERE id = $1', [result.rows[0].shop_id]);
  const body = status === 'active'
    ? `"${result.rows[0].title}" was approved and is now live.`
    : `"${result.rows[0].title}" was rejected${reason ? `: ${reason}` : '.'}`;
  await query(
    `INSERT INTO notifications (user_id, type, title, body, sent_by) VALUES ($1,$2,$3,$4,$5)`,
    [shop.rows[0].owner_id, status === 'active' ? 'product_approved' : 'product_rejected',
     status === 'active' ? 'Listing approved' : 'Listing rejected', body, req.user.id]
  );
  res.json({ message: `Product ${status}.` });
}

// ===== Ads =====
// Admin-facing: create/list/update/remove ads across every placement
// (hero, deals, sidebar, category, header_strip), with optional scheduling
// window and priority ordering.
export async function createAd(req, res) {
  const {
    title, imageUrl, videoUrl, linkUrl, subtitle, ctaText, badgeText,
    placement, priority, startsAt, endsAt, targetCategory,
    mediaType, autoplay, muted, loopVideo, durationSeconds, thumbnailUrl
  } = req.body;
  const result = await query(
    `INSERT INTO ads
       (title, image_url, video_url, link_url, subtitle, cta_text, badge_text, placement, priority, starts_at, ends_at, target_category,
        media_type, autoplay, muted, loop_video, duration_seconds, thumbnail_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'hero'),COALESCE($9,0),$10,$11,$12,
             COALESCE($13, CASE WHEN $3 IS NOT NULL THEN 'video' ELSE 'image' END),
             COALESCE($14, TRUE), COALESCE($15, TRUE), COALESCE($16, TRUE), $17, $18, $19)
     RETURNING *`,
    [title, imageUrl, videoUrl || null, linkUrl || null, subtitle || null, ctaText || null, badgeText || null,
     placement || null, priority ?? null, startsAt || null, endsAt || null, targetCategory || null,
     mediaType || null, autoplay ?? null, muted ?? null, loopVideo ?? null, durationSeconds ?? null, thumbnailUrl || null,
     req.user.id]
  );
  res.status(201).json({ ad: result.rows[0] });
}

// Admin list — every ad regardless of active/schedule state, so the admin
// panel can manage past/future/paused ads too.
export async function listActiveAds(req, res) {
  const { placement } = req.query;
  const conditions = [];
  const values = [];
  if (placement) { conditions.push(`placement = $${values.length + 1}`); values.push(placement); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM ads ${where} ORDER BY priority DESC, created_at DESC`, values
  );
  res.json({ ads: result.rows });
}

export async function updateAd(req, res) {
  const { id } = req.params;
  const allowed = {
    title: 'title', imageUrl: 'image_url', videoUrl: 'video_url', linkUrl: 'link_url', subtitle: 'subtitle',
    ctaText: 'cta_text', badgeText: 'badge_text', placement: 'placement', priority: 'priority',
    startsAt: 'starts_at', endsAt: 'ends_at', targetCategory: 'target_category', active: 'active',
    mediaType: 'media_type', autoplay: 'autoplay', muted: 'muted', loopVideo: 'loop_video',
    durationSeconds: 'duration_seconds', thumbnailUrl: 'thumbnail_url'
  };
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of Object.keys(req.body)) {
    if (allowed[key]) { sets.push(`${allowed[key]} = $${i}`); values.push(req.body[key]); i += 1; }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  values.push(id);
  const result = await query(`UPDATE ads SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ad not found.' });
  res.json({ ad: result.rows[0] });
}

export async function deleteAd(req, res) {
  await query('UPDATE ads SET active = FALSE WHERE id = $1', [req.params.id]);
  res.json({ message: 'Ad removed.' });
}

// Public — only ads that are active AND currently inside their scheduling
// window (or unscheduled), optionally filtered to one placement, ordered by
// priority. Also records an impression per ad returned.
export async function listPublicAds(req, res) {
  const { placement } = req.query;
  const conditions = [
    'active = TRUE',
    '(starts_at IS NULL OR starts_at <= now())',
    '(ends_at IS NULL OR ends_at >= now())'
  ];
  const values = [];
  if (placement) { conditions.push(`placement = $${values.length + 1}`); values.push(placement); }
  const result = await query(
    `SELECT id, title, subtitle, image_url, video_url, link_url, cta_text, badge_text, placement, target_category,
            media_type, autoplay, muted, loop_video, duration_seconds, thumbnail_url
     FROM ads WHERE ${conditions.join(' AND ')} ORDER BY priority DESC, created_at DESC LIMIT 20`,
    values
  );
  if (result.rows.length > 0) {
    const ids = result.rows.map((r) => r.id);
    query(`UPDATE ads SET impressions_count = impressions_count + 1 WHERE id = ANY($1::uuid[])`, [ids]).catch(() => {});
  }
  res.json({ ads: result.rows });
}

export async function trackAdClick(req, res) {
  const result = await query('UPDATE ads SET clicks_count = clicks_count + 1 WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ad not found.' });
  res.json({ message: 'Click recorded.' });
}

// ===== Platform settings (logo, theme, card orientation, fee %) =====
export async function getSettings(req, res) {
  const result = await query('SELECT * FROM platform_settings WHERE id = 1');
  res.json({ settings: result.rows[0] });
}
export async function updateSettings(req, res) {
  const { logoUrl, themePrimaryColor, themeAccentColor, productCardOrientation, platformFeePercent, upgradeFeeAmount } = req.body;
  const result = await query(
    `UPDATE platform_settings SET
       logo_url = COALESCE($1, logo_url),
       theme_primary_color = COALESCE($2, theme_primary_color),
       theme_accent_color = COALESCE($3, theme_accent_color),
       product_card_orientation = COALESCE($4, product_card_orientation),
       platform_fee_percent = COALESCE($5, platform_fee_percent),
       upgrade_fee_amount = COALESCE($6, upgrade_fee_amount)
     WHERE id = 1 RETURNING *`,
    [logoUrl, themePrimaryColor, themeAccentColor, productCardOrientation, platformFeePercent, upgradeFeeAmount]
  );
  invalidateSettingsCache();
  res.json({ message: 'Settings updated.', settings: result.rows[0] });
}

export async function platformWalletSummary(req, res) {
  const wallets = await query(`SELECT * FROM wallets WHERE type IN ('platform','escrow')`);
  const orderStats = await query(`SELECT status, COUNT(*) FROM orders GROUP BY status`);
  res.json({ wallets: wallets.rows, orderStats: orderStats.rows });
}

// Percent change helper: current vs previous period, guarding div-by-zero.
function pctChange(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / p) * 1000) / 10;
}

// Single aggregate endpoint backing every role's dashboard overview
// (Super Admin / Admin / Staff / Support). The frontend decides which
// cards/sections to show per admin_role — this just returns the numbers
// that role could plausibly need.
export async function getDashboardSummary(req, res) {
  const role = req.user?.adminRole || null;
  const isFullAccess = !role || role === 'super_admin';

  const [
    userTotals, sellerTotals, orderTotals, revenueTotals,
    ordersOverview, ordersByStatus, topCategories,
    recentOrders, recentRegistrations,
    pendingShops, pendingProducts, pendingUpgrades, pendingWithdrawals,
    lowStock, disputedOrders,
  ] = await Promise.all([
    query(`SELECT
      COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS current_30d,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS prior_30d,
      COUNT(*) AS total
      FROM users`),
    query(`SELECT
      COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS current_30d,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS prior_30d,
      COUNT(*) AS total
      FROM shops`),
    query(`SELECT
      COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS current_30d,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS prior_30d,
      COUNT(*) AS total
      FROM orders`),
    query(`SELECT
      COALESCE(SUM(total_amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0) AS current_30d,
      COALESCE(SUM(total_amount) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days'), 0) AS prior_30d
      FROM orders WHERE status IN ('paid_escrow','shipped','delivered_confirmed','completed')`),
    query(`SELECT date_trunc('day', created_at) AS day,
      COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue
      FROM orders WHERE created_at >= now() - interval '30 days'
      GROUP BY day ORDER BY day ASC`),
    query(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`),
    query(`SELECT category, COUNT(*) AS count FROM products GROUP BY category ORDER BY count DESC LIMIT 5`),
    query(`SELECT o.id, o.total_amount, o.status, o.created_at, o.currency,
      u.full_name AS buyer_name
      FROM orders o JOIN users u ON u.id = o.buyer_id
      ORDER BY o.created_at DESC LIMIT 6`),
    query(`SELECT id, full_name, primary_role, created_at FROM users ORDER BY created_at DESC LIMIT 4`),
    query(`SELECT COUNT(*) AS count FROM shops WHERE status = 'pending'`),
    query(`SELECT COUNT(*) AS count FROM products WHERE status = 'pending_review'`),
    query(`SELECT COUNT(*) AS count FROM role_upgrades WHERE status IN ('pending_payment','pending_approval')`),
    query(`SELECT COUNT(*) AS count FROM withdrawal_requests WHERE status = 'pending'`),
    query(`SELECT COUNT(*) AS count FROM products WHERE quantity_available <= 5 AND status = 'active'`),
    query(`SELECT COUNT(*) AS count FROM orders WHERE status = 'disputed'`),
  ]);

  const u = userTotals.rows[0], s = sellerTotals.rows[0], o = orderTotals.rows[0], r = revenueTotals.rows[0];

  const totalCategoryCount = topCategories.rows.reduce((sum, c) => sum + Number(c.count), 0) || 1;

  res.json({
    role,
    scope: isFullAccess ? 'platform' : role,
    stats: {
      users: { total: Number(u.total), change: pctChange(u.current_30d, u.prior_30d) },
      sellers: { total: Number(s.total), change: pctChange(s.current_30d, s.prior_30d) },
      orders: { total: Number(o.total), change: pctChange(o.current_30d, o.prior_30d) },
      revenue: { total: Number(r.current_30d), change: pctChange(r.current_30d, r.prior_30d) },
    },
    ordersOverview: ordersOverview.rows.map((row) => ({
      day: row.day, orders: Number(row.orders), revenue: Number(row.revenue),
    })),
    ordersByStatus: ordersByStatus.rows.map((row) => ({ status: row.status, count: Number(row.count) })),
    topCategories: topCategories.rows.map((row) => ({
      category: row.category,
      count: Number(row.count),
      percent: Math.round((Number(row.count) / totalCategoryCount) * 100),
    })),
    recentOrders: recentOrders.rows.map((row) => ({
      id: row.id, buyerName: row.buyer_name, amount: Number(row.total_amount),
      currency: row.currency, status: row.status, createdAt: row.created_at,
    })),
    recentRegistrations: recentRegistrations.rows.map((row) => ({
      id: row.id, fullName: row.full_name, role: row.primary_role, createdAt: row.created_at,
    })),
    pendingApprovals: {
      shops: Number(pendingShops.rows[0].count),
      products: Number(pendingProducts.rows[0].count),
      upgrades: Number(pendingUpgrades.rows[0].count),
      withdrawals: Number(pendingWithdrawals.rows[0].count),
    },
    systemAlerts: {
      lowStock: Number(lowStock.rows[0].count),
      disputedOrders: Number(disputedOrders.rows[0].count),
    },
  });
}
// Full products management — not just the pending-review queue. Supports
// filtering by status/category so the admin Products page can show
// everything, not only what's awaiting approval.
export async function listAllProducts(req, res) {
  const { status, category, search, page = 1, pageSize = 50 } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;

  if (status) { conditions.push(`p.status = $${i}`); values.push(status); i += 1; }
  if (category) { conditions.push(`p.category = $${i}`); values.push(category); i += 1; }
  if (search) { conditions.push(`(p.title ILIKE $${i} OR s.name ILIKE $${i})`); values.push(`%${search}%`); i += 1; }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Number(pageSize) || 50, 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [result, countResult] = await Promise.all([
    query(
      `SELECT p.*, s.name AS shop_name, s.owner_id
       FROM products p JOIN shops s ON s.id = p.shop_id
       ${where} ORDER BY p.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM products p JOIN shops s ON s.id = p.shop_id ${where}`, values),
  ]);
  res.json({ products: result.rows, total: Number(countResult.rows[0].count), page: Number(page), pageSize: limit });
}

export async function toggleProductFeature(req, res) {
  const { id } = req.params;
  const result = await query(
    `UPDATE products SET is_featured = NOT is_featured WHERE id = $1 RETURNING id, is_featured`,
    [id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json({ message: `Product ${result.rows[0].is_featured ? 'featured' : 'unfeatured'}.`, product: result.rows[0] });
}

export async function deleteProductAsAdmin(req, res) {
  const { id } = req.params;
  const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json({ message: 'Product removed.' });
}
export async function forceLogoutAllUsers(req, res) {
  try {
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE revoked = FALSE');
    res.json({ message: 'All user sessions have been revoked platform-wide.' });
  } catch (err) {
    console.error('Force logout all users error:', err);
    res.status(500).json({ error: 'Could not force logout all users.' });
  }
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------------
// Mission Control — the single aggregate endpoint behind the redesigned
// Admin Dashboard landing screen. Every field is a real query against a
// real table (orders, shops, products, users, payments, wallets,
// deliveries, security_events, api_traffic_stats, shop_trust_metrics,
// shop_risk_signals, fraud_flags, partner_support_tickets, platform
// database size via pg_database_size). Nothing here is random or
// hardcoded — a fresh/empty database renders zeros, not sample data.
// Only full-access roles (super_admin / legacy null) see this; narrower
// admin_role users keep the existing scoped getDashboardSummary view.
// ---------------------------------------------------------------------
export async function getMissionControl(req, res) {
  const dbStart = Date.now();

  const [
    revenueToday, revenueYesterday, ordersTodayByStatus,
    productsOnline, productsPending,
    customers, sellers, verifiedShopsCount, totalShops,
    deliveriesInProgress, supportTicketsOpen,
    apiRequestsToday, fraudBlocked24h, unresolvedRiskSignals, openFraudFlags,
    paymentStats30d, dbSizeResult,
    revenueTrend7d, ordersByStatusAll, topCategories, topShops, paymentMethods, topCountries,
    lowStockProducts, categoryGrowth,
    adminRoleDistribution,
    walletsSummary, withdrawalsSummary, refundsSummary, platformFeeRow,
    recentlyVerifiedShops, shopsNearVerification,
    recentOrdersFeed, recentSecurityFeed, recentVerifiedFeed, recentWithdrawalsFeed, recentFeedPosts,
    maintenanceRow,
  ] = await Promise.all([
    query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE created_at::date = CURRENT_DATE AND status IN ('paid_escrow','shipped','delivered_confirmed','completed')`),
    query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE created_at::date = CURRENT_DATE - INTERVAL '1 day' AND status IN ('paid_escrow','shipped','delivered_confirmed','completed')`),
    query(`SELECT
      COUNT(*) FILTER (WHERE status IN ('completed','delivered_confirmed')) AS completed,
      COUNT(*) FILTER (WHERE status IN ('pending_payment','paid_escrow','shipped')) AS pending,
      COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
      COUNT(*) AS total
      FROM orders WHERE created_at::date = CURRENT_DATE`),
    query(`SELECT COUNT(*) AS count FROM products WHERE status = 'active'`),
    query(`SELECT COUNT(*) AS count FROM products WHERE status = 'pending_review'`),
    query(`SELECT COUNT(*) AS count FROM users WHERE primary_role = 'buyer'`),
    query(`SELECT COUNT(*) AS count FROM users WHERE primary_role = 'seller'`),
    query(`SELECT COUNT(*) AS count FROM shops WHERE is_verified = TRUE`),
    query(`SELECT COUNT(*) AS count FROM shops`),
    query(`SELECT COUNT(*) AS count FROM deliveries WHERE status IN ('confirmed','processing','packed','assigned_to_driver','out_for_delivery')`),
    query(`SELECT COUNT(*) AS count FROM partner_support_tickets WHERE status = 'open'`),
    query(`SELECT COALESCE(SUM(request_count),0) AS requests, COALESCE(SUM(blocked_count),0) AS blocked FROM api_traffic_stats WHERE hour_bucket >= date_trunc('day', now())`),
    query(`SELECT COUNT(*) AS count FROM security_events WHERE created_at > now() - interval '24 hours'`),
    query(`SELECT COUNT(*) AS count FROM shop_risk_signals WHERE status = 'open'`),
    query(`SELECT COUNT(*) AS count, COALESCE(SUM(severity),0) AS weight FROM fraud_flags WHERE status IN ('open','reviewing')`),
    query(`SELECT
      COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      COUNT(*) AS total
      FROM payments WHERE created_at > now() - interval '30 days'`),
    query(`SELECT pg_database_size(current_database()) AS bytes`),
    query(`SELECT date_trunc('day', created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total_amount) FILTER (WHERE status IN ('paid_escrow','shipped','delivered_confirmed','completed')), 0) AS revenue
      FROM orders WHERE created_at >= now() - interval '7 days' GROUP BY day ORDER BY day ASC`),
    query(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`),
    query(`SELECT category, COUNT(*) AS count FROM products GROUP BY category ORDER BY count DESC LIMIT 6`),
    query(`SELECT s.id, s.name, COALESCE(SUM(o.total_amount),0) AS revenue, COUNT(o.id) AS orders
      FROM shops s JOIN orders o ON o.shop_id = s.id AND o.status IN ('paid_escrow','shipped','delivered_confirmed','completed')
      GROUP BY s.id, s.name ORDER BY revenue DESC LIMIT 5`),
    query(`SELECT method, COUNT(*) AS count FROM payments WHERE status = 'succeeded' AND created_at > now() - interval '30 days' GROUP BY method ORDER BY count DESC`),
    query(`SELECT location_country AS country, COUNT(*) AS count FROM users WHERE location_country IS NOT NULL AND location_country <> '' GROUP BY location_country ORDER BY count DESC LIMIT 8`),
    query(`SELECT COUNT(*) AS count FROM products WHERE quantity_available <= 5 AND status = 'active'`),
    query(`SELECT p.category AS category,
        COUNT(*) FILTER (WHERE o.created_at > now() - interval '7 days') AS recent,
        COUNT(*) FILTER (WHERE o.created_at > now() - interval '14 days' AND o.created_at <= now() - interval '7 days') AS prior
      FROM orders o JOIN products p ON p.id = o.product_id
      GROUP BY p.category ORDER BY recent DESC LIMIT 5`),
    // COALESCE first: legacy super admins have admin_role = NULL, newer
    // ones have admin_role = 'super_admin' (see isSuperAdmin in
    // middleware/auth.js) — both mean the same tier. Grouping by the raw
    // column split them into two rows that the mapper below both labelled
    // "super_admin", producing a duplicate React key and an undercount on
    // each row. Grouping by the normalized value merges them into one.
    query(`SELECT COALESCE(admin_role, 'super_admin') AS admin_role, COUNT(*) AS count FROM users WHERE is_admin = TRUE GROUP BY COALESCE(admin_role, 'super_admin')`),
    query(`SELECT type, COALESCE(SUM(balance),0) AS total FROM wallets GROUP BY type`),
    query(`SELECT status, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM withdrawal_requests GROUP BY status`),
    query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'refunded' AND created_at > now() - interval '30 days'`),
    query(`SELECT platform_fee_percent FROM platform_settings WHERE id = 1`),
    query(`SELECT id, name, verified_since FROM shops WHERE is_verified = TRUE ORDER BY verified_since DESC NULLS LAST LIMIT 5`),
    query(`SELECT COUNT(*) AS count FROM shop_trust_metrics WHERE trust_score >= 60 AND trust_score < 80`),
    query(`SELECT o.id, o.total_amount, o.currency, o.status, o.created_at, u.full_name AS buyer_name
      FROM orders o JOIN users u ON u.id = o.buyer_id ORDER BY o.created_at DESC LIMIT 6`),
    query(`SELECT id, event_type, severity, summary, created_at FROM security_events ORDER BY created_at DESC LIMIT 6`),
    query(`SELECT id, name AS shop_name, verified_since AS created_at FROM shops WHERE is_verified = TRUE AND verified_since IS NOT NULL ORDER BY verified_since DESC LIMIT 4`),
    query(`SELECT wr.id, wr.amount, wr.currency, wr.status, wr.created_at, u.full_name FROM withdrawal_requests wr JOIN users u ON u.id = wr.user_id WHERE wr.status IN ('approved','paid') ORDER BY wr.created_at DESC LIMIT 4`),
    query(`SELECT sfp.id, sfp.post_type, sfp.caption, sfp.created_at, s.name AS shop_name FROM shop_feed_posts sfp JOIN shops s ON s.id = sfp.shop_id WHERE sfp.status = 'published' ORDER BY sfp.created_at DESC LIMIT 4`),
    query(`SELECT maintenance_settings, emergency_controls FROM platform_settings WHERE id = 1`),
  ]);

  const dbLatencyMs = Date.now() - dbStart;

  const revToday = Number(revenueToday.rows[0].total);
  const revYesterday = Number(revenueYesterday.rows[0].total);
  const ot = ordersTodayByStatus.rows[0];
  const feePercent = Number(platformFeeRow.rows[0]?.platform_fee_percent || 0);

  const payments30 = paymentStats30d.rows[0];
  const paymentAttempts = Number(payments30.succeeded) + Number(payments30.failed);
  const paymentSuccessRate = paymentAttempts > 0 ? Math.round((Number(payments30.succeeded) / paymentAttempts) * 1000) / 10 : null;

  // Merge distinct real event streams into one time-sorted activity feed
  // instead of a single brittle UNION across differently-shaped tables.
  const activity = [
    ...recentOrdersFeed.rows.map((r) => ({
      id: `order-${r.id}`, type: 'order', createdAt: r.created_at,
      text: `${r.status === 'completed' || r.status === 'delivered_confirmed' ? 'Order completed' : 'Order placed'} by ${r.buyer_name}`,
      detail: `${r.currency} ${Number(r.total_amount).toLocaleString()}`, status: r.status,
    })),
    ...recentSecurityFeed.rows.map((r) => ({
      id: `sec-${r.id}`, type: 'security', createdAt: r.created_at,
      text: r.summary, detail: r.event_type.replace(/_/g, ' '), severity: r.severity,
    })),
    ...recentVerifiedFeed.rows.map((r) => ({
      id: `verify-${r.id}`, type: 'verification', createdAt: r.created_at,
      text: `${r.shop_name} became a Verified Shop`, detail: 'Shop verification',
    })),
    ...recentWithdrawalsFeed.rows.map((r) => ({
      id: `wd-${r.id}`, type: 'finance', createdAt: r.created_at,
      text: `Withdrawal ${r.status} for ${r.full_name}`, detail: `${r.currency} ${Number(r.amount).toLocaleString()}`,
    })),
    ...recentFeedPosts.rows.map((r) => ({
      id: `post-${r.id}`, type: 'marketing', createdAt: r.created_at,
      text: `${r.shop_name} published a ${r.post_type.replace(/_/g, ' ')} post`, detail: (r.caption || '').slice(0, 60),
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 12);

  // Rule-based AI insights — every recommendation carries the real number
  // that produced it so admins see exactly why it was made.
  const insights = [];
  const lowStock = Number(lowStockProducts.rows[0].count);
  if (lowStock > 0) {
    insights.push({
      id: 'low-stock', tone: 'warning', title: 'Restock recommendation',
      body: `${lowStock} active product${lowStock === 1 ? '' : 's'} ${lowStock === 1 ? 'has' : 'have'} 5 or fewer units left.`,
      why: `Based on live inventory: quantity_available ≤ 5 across ${lowStock} active listing${lowStock === 1 ? '' : 's'}.`,
    });
  }
  const risingCategory = categoryGrowth.rows.find((c) => Number(c.recent) > Number(c.prior) && Number(c.recent) >= 3);
  if (risingCategory) {
    const growth = Number(risingCategory.prior) > 0
      ? Math.round(((Number(risingCategory.recent) - Number(risingCategory.prior)) / Number(risingCategory.prior)) * 100)
      : 100;
    insights.push({
      id: 'trending-category', tone: 'positive', title: `${risingCategory.category.replace(/_/g, ' ')} is trending`,
      body: `Orders in this category are up ${growth}% week over week — consider promoting it.`,
      why: `${risingCategory.recent} orders in the last 7 days vs ${risingCategory.prior} in the 7 days before.`,
    });
  }
  const openFraud = openFraudFlags.rows[0];
  if (Number(openFraud.count) > 0) {
    insights.push({
      id: 'fraud-review', tone: 'critical', title: 'Fraud flags need review',
      body: `${openFraud.count} fraud flag${Number(openFraud.count) === 1 ? '' : 's'} open or under review.`,
      why: `Combined severity weight of ${openFraud.weight} across open/reviewing entries in fraud_flags.`,
    });
  }
  const riskCount = Number(unresolvedRiskSignals.rows[0].count);
  if (riskCount > 0) {
    insights.push({
      id: 'shop-risk', tone: 'warning', title: 'Shops with unresolved risk signals',
      body: `${riskCount} shop risk signal${riskCount === 1 ? '' : 's'} still open (fake followers, review bursts, suspicious orders).`,
      why: `Count of shop_risk_signals rows with status = 'open'.`,
    });
  }
  const nearVerification = Number(shopsNearVerification.rows[0].count);
  if (nearVerification > 0) {
    insights.push({
      id: 'near-verification', tone: 'positive', title: 'Shops close to Verified status',
      body: `${nearVerification} shop${nearVerification === 1 ? '' : 's'} sit between 60-79 trust score — close to the verification bar.`,
      why: `From shop_trust_metrics: trust_score between 60 and 80.`,
    });
  }
  if (paymentSuccessRate !== null && paymentSuccessRate < 90) {
    insights.push({
      id: 'payment-health', tone: 'critical', title: 'Payment success rate dropped',
      body: `Only ${paymentSuccessRate}% of payment attempts succeeded in the last 30 days.`,
      why: `${payments30.succeeded} succeeded out of ${paymentAttempts} attempts in payments table.`,
    });
  }

  const walletsByType = {};
  walletsSummary.rows.forEach((r) => { walletsByType[r.type] = Number(r.total); });
  const withdrawalsByStatus = {};
  withdrawalsSummary.rows.forEach((r) => { withdrawalsByStatus[r.status] = { total: Number(r.total), count: Number(r.count) }; });

  const totalCategoryCount = topCategories.rows.reduce((s, c) => s + Number(c.count), 0) || 1;
  const totalPaymentMethodCount = paymentMethods.rows.reduce((s, p) => s + Number(p.count), 0) || 1;
  const totalCountryCount = topCountries.rows.reduce((s, c) => s + Number(c.count), 0) || 1;

  res.json({
    generatedAt: new Date().toISOString(),
    kpis: {
      revenueToday: revToday,
      revenueChangeVsYesterday: pctChange(revToday, revYesterday),
      ordersToday: { completed: Number(ot.completed), pending: Number(ot.pending), cancelled: Number(ot.cancelled), total: Number(ot.total) },
      productsOnline: Number(productsOnline.rows[0].count),
      productsPending: Number(productsPending.rows[0].count),
      customers: Number(customers.rows[0].count),
      sellers: Number(sellers.rows[0].count),
      verifiedShops: Number(verifiedShopsCount.rows[0].count),
      totalShops: Number(totalShops.rows[0].count),
      deliveriesInProgress: Number(deliveriesInProgress.rows[0].count),
      supportTicketsOpen: Number(supportTicketsOpen.rows[0].count),
      apiRequestsToday: Number(apiRequestsToday.rows[0].requests),
      apiBlockedToday: Number(apiRequestsToday.rows[0].blocked),
      fraudAttemptsBlocked24h: Number(fraudBlocked24h.rows[0].count),
      paymentSuccessRate,
      storageUsage: formatBytes(dbSizeResult.rows[0].bytes),
      storageUsageBytes: Number(dbSizeResult.rows[0].bytes),
      uptimeSeconds: Math.round(process.uptime()),
      dbLatencyMs,
    },
    charts: {
      revenueTrend7d: revenueTrend7d.rows.map((r) => ({ day: r.day, orders: Number(r.orders), revenue: Number(r.revenue) })),
      ordersByStatus: ordersByStatusAll.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      topCategories: topCategories.rows.map((r) => ({ category: r.category, count: Number(r.count), percent: Math.round((Number(r.count) / totalCategoryCount) * 100) })),
      topShops: topShops.rows.map((r) => ({ id: r.id, name: r.name, revenue: Number(r.revenue), orders: Number(r.orders) })),
      paymentMethods: paymentMethods.rows.map((r) => ({ method: r.method, count: Number(r.count), percent: Math.round((Number(r.count) / totalPaymentMethodCount) * 100) })),
      topCountries: topCountries.rows.map((r) => ({ country: r.country, count: Number(r.count), percent: Math.round((Number(r.count) / totalCountryCount) * 100) })),
    },
    activity,
    insights,
    roleDistribution: adminRoleDistribution.rows.map((r) => ({ role: r.admin_role || 'super_admin', count: Number(r.count) })),
    finance: {
      revenueToday: revToday,
      commissionEstimateToday: Math.round(revToday * (feePercent / 100)),
      platformFeePercent: feePercent,
      escrowBalance: walletsByType.escrow || 0,
      platformBalance: walletsByType.platform || 0,
      pendingWithdrawals: withdrawalsByStatus.pending || { total: 0, count: 0 },
      completedWithdrawals: withdrawalsByStatus.paid || { total: 0, count: 0 },
      refunds30d: { count: Number(refundsSummary.rows[0].count), total: Number(refundsSummary.rows[0].total) },
    },
    verifiedShopsPanel: {
      recentlyVerified: recentlyVerifiedShops.rows.map((r) => ({ id: r.id, name: r.name, verifiedSince: r.verified_since })),
      nearVerificationCount: nearVerification,
      verifiedCount: Number(verifiedShopsCount.rows[0].count),
      totalShops: Number(totalShops.rows[0].count),
    },
    maintenance: maintenanceRow.rows[0]?.maintenance_settings || { maintenanceMode: false, maintenanceMessage: '' },
    emergencyControls: maintenanceRow.rows[0]?.emergency_controls || { paymentsFrozen: false, partnerApisDisabled: false, loginDisabled: false, withdrawalsFrozen: false },
  });
}

// Stage 3 — the tiered trust badge (business_profiles.verification_level)
// sits above the pending/active/suspended lifecycle already handled by
// upgradeController's approval flow. Only an active profile is eligible
// for anything beyond 'unverified'.
const VERIFICATION_LEVELS = ['unverified', 'basic', 'verified', 'trusted', 'elite'];

export async function updateBusinessVerificationLevel(req, res) {
  const { businessProfileId } = req.params;
  const { level, note } = req.body;
  if (!VERIFICATION_LEVELS.includes(level)) {
    return res.status(400).json({ error: `level must be one of: ${VERIFICATION_LEVELS.join(', ')}` });
  }
  try {
    const profileResult = await query('SELECT * FROM business_profiles WHERE id = $1', [businessProfileId]);
    const profile = profileResult.rows[0];
    if (!profile) return res.status(404).json({ error: 'Business profile not found.' });
    if (level !== 'unverified' && profile.status !== 'active') {
      return res.status(400).json({ error: 'Only an active business profile can hold a verification level above unverified.' });
    }

    const result = await query(
      `UPDATE business_profiles
       SET verification_level = $1, verification_level_note = $2,
           verification_level_updated_by = $3, verification_level_updated_at = now()
       WHERE id = $4 RETURNING *`,
      [level, note || null, req.user.id, businessProfileId]
    );

    await logSecurityEvent(null, {
      actorId: req.user.id, actorRole: 'admin', eventType: 'verification_level_changed',
      entityType: 'business_profile', entityId: businessProfileId,
      metadata: { from: profile.verification_level, to: level, note }
    });
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'verification_level_changed',$2,$3,$4)`,
      [profile.user_id, 'Verification level updated', `Your business is now rated "${level}".`, JSON.stringify({ level })]
    );

    return res.json({ message: 'Verification level updated.', businessProfile: result.rows[0] });
  } catch (err) {
    console.error('Update business verification level error:', err);
    return res.status(500).json({ error: 'Could not update verification level.' });
  }
}

// Lists every manufacturer/supplier/dropshipper business profile with its
// current trust level, for the admin Verification Levels screen.
export async function listBusinessVerificationLevels(req, res) {
  const { businessType } = req.query;
  const conditions = [`status = 'active'`];
  const values = [];
  let i = 1;
  if (businessType) { conditions.push(`business_type = $${i}`); values.push(businessType); i += 1; }
  try {
    const result = await query(
      `SELECT bp.*, u.username, u.email
       FROM business_profiles bp JOIN users u ON u.id = bp.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY bp.verification_level DESC, bp.created_at DESC`,
      values
    );
    return res.json({ businesses: result.rows });
  } catch (err) {
    console.error('List business verification levels error:', err);
    return res.status(500).json({ error: 'Could not load business verification levels.' });
  }
}
