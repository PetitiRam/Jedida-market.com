import { query } from '../config/db.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUploadAny } from '../services/uploadSecurity.js';
import { recordSecurityEvent } from '../services/securityEventService.js';
import { blockUser as blockUserRow, unblockUser as unblockUserRow, isBlockedEitherWay, listBlockedUsers } from '../chat/chatService.js';
import { getIO } from '../chat/chatSocket.js';
import { sendPushToUser } from '../services/pushService.js';

// ---------------------------------------------------------------------------
// ROLE-SPECIFIC SUMMARIES — every block here reads from tables that already
// exist per role (business_profiles, drivers, shops, wallets, orders...)
// rather than duplicating any of that data onto the profile itself.
// ---------------------------------------------------------------------------

async function getShopSummary(userId) {
  const shopResult = await query('SELECT id, name, slug, logo_url, is_verified FROM shops WHERE owner_id = $1', [userId]);
  const shop = shopResult.rows[0];
  if (!shop) return null;

  const [ratingResult, followerResult, productsResult] = await Promise.all([
    query(
      `SELECT COALESCE(AVG(r.rating), 0) AS average, COUNT(r.id) AS count
       FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE p.shop_id = $1`,
      [shop.id]
    ),
    query('SELECT COUNT(*) AS count FROM shop_follows WHERE shop_id = $1', [shop.id]),
    query(`SELECT COUNT(*) AS count FROM products WHERE shop_id = $1 AND status = 'active'`, [shop.id])
  ]);

  return {
    ...shop,
    rating: Number(ratingResult.rows[0].average),
    reviewCount: Number(ratingResult.rows[0].count),
    followerCount: Number(followerResult.rows[0].count),
    productsCount: Number(productsResult.rows[0].count)
  };
}

async function getBusinessProfileSummary(userId) {
  const result = await query(
    `SELECT id, business_type, company_name, status, verification_level, verification_level_note,
            factory_address, warehouse_address, production_capacity, stock_availability,
            dropship_total_orders, dropship_completed_orders, dropship_reversed_orders,
            dropship_total_sales_amount, dropship_total_commission_earned, dropship_performance_score
     FROM business_profiles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getDriverSummary(userId) {
  const driverResult = await query('SELECT id, vehicle_type, license_plate, is_available, rating FROM drivers WHERE user_id = $1', [userId]);
  const driver = driverResult.rows[0];
  if (!driver) return null;
  const deliveredResult = await query(`SELECT COUNT(*) AS count FROM deliveries WHERE driver_id = $1 AND status = 'delivered'`, [driver.id]);
  return { ...driver, completedDeliveries: Number(deliveredResult.rows[0].count) };
}

async function getBuyerStats(userId) {
  const [ordersResult, reviewsResult, disputesResult] = await Promise.all([
    query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS completed FROM orders WHERE buyer_id = $1`, [userId]),
    query('SELECT COUNT(*) AS count FROM product_reviews WHERE buyer_id = $1', [userId]),
    query('SELECT COUNT(*) AS count FROM disputes WHERE opened_by = $1', [userId])
  ]);
  return {
    ordersPlaced: Number(ordersResult.rows[0].total),
    ordersCompleted: Number(ordersResult.rows[0].completed),
    reviewsWritten: Number(reviewsResult.rows[0].count),
    disputesOpened: Number(disputesResult.rows[0].count)
  };
}

async function getWallet(userId) {
  const result = await query(`SELECT balance, currency FROM wallets WHERE owner_id = $1 AND type = 'user'`, [userId]);
  return result.rows[0] || null;
}

async function getFollowCounts(userId) {
  const [followers, following] = await Promise.all([
    query('SELECT COUNT(*) AS count FROM user_follows WHERE following_id = $1', [userId]),
    query('SELECT COUNT(*) AS count FROM user_follows WHERE follower_id = $1', [userId])
  ]);
  return {
    followerCount: Number(followers.rows[0].count),
    followingCount: Number(following.rows[0].count)
  };
}

// ---------------------------------------------------------------------------
// AUTHORIZED ROLES — a user's identity is still one row in `users` (one
// login, one session, one primary_role for permission checks elsewhere).
// This aggregates every role that account has ever been *approved* for —
// past primary_role changes included — so the profile can display "Buyer,
// Verified Seller, Dropshipper" on one identity instead of forcing a
// separate account per role. Nothing here writes to users.primary_role or
// touches auth; it's a read-time view over role_upgrades/business_profiles/
// drivers, the same tables getMyProfile already reads.
//
// verification and reputation are kept as separate concepts per role:
//   - verification: is_verified / verification_level / shop.is_verified —
//     platform-granted, never user-claimed (see updateMyProfile below).
//   - reputation: rating / trust metrics / performance score — earned
//     continuously from orders/reviews, independent of verification.
// ---------------------------------------------------------------------------

export async function getAuthorizedRoles(userId, primaryRole) {
  const roles = new Map(); // role -> { role, source, verification, reputation }
  const add = (role, extra = {}) => {
    if (!role) return;
    roles.set(role, { role, ...extra, ...(roles.get(role) || {}) });
  };

  add('buyer', { source: 'default' });
  add(primaryRole, { source: 'primary_role' });

  const [upgrades, businessRows, driverRow, shopRow] = await Promise.all([
    query(`SELECT DISTINCT requested_role FROM role_upgrades WHERE user_id = $1 AND status = 'approved'`, [userId]),
    query(
      `SELECT business_type, status, verification_level, dropship_performance_score
       FROM business_profiles WHERE user_id = $1 AND status = 'active'`,
      [userId]
    ),
    query(`SELECT rating FROM drivers WHERE user_id = $1`, [userId]),
    query(`SELECT is_verified FROM shops WHERE owner_id = $1`, [userId])
  ]);

  for (const row of upgrades.rows) {
    // 'host' is the platform's internal role name for Live Host.
    add(row.requested_role === 'host' ? 'live_host' : row.requested_role, { source: 'role_upgrade' });
  }

  for (const row of businessRows.rows) {
    add(row.business_type, {
      source: 'business_profile',
      verification: { level: row.verification_level || 'unverified' },
      reputation: row.dropship_performance_score != null ? { performanceScore: Number(row.dropship_performance_score) } : undefined
    });
  }

  if (driverRow.rows[0]) {
    add('delivery', { source: 'driver_profile', reputation: { rating: Number(driverRow.rows[0].rating) || null } });
  }

  if (shopRow.rows[0]) {
    // Owning a shop always implies (at least) the seller role, even if
    // primary_role has since moved on to something else — the seller
    // identity and its storefront don't disappear.
    add('seller', { source: 'shop_ownership' });
    if (shopRow.rows[0].is_verified) {
      const existing = roles.get('seller') || {};
      roles.set('seller', { ...existing, verification: { ...(existing.verification || {}), shopVerified: true } });
    }
  }

  return Array.from(roles.values());
}

// A role is a "Verified Seller"-style badge only when the platform granted
// it — never from a user-editable field. This is the single source of
// truth updateMyProfile's whitelist below is built to protect.
function isPlatformVerified(user, shop) {
  return Boolean(user.is_verified || shop?.is_verified);
}

// ---------------------------------------------------------------------------
// OWN PROFILE — full picture, gated behind auth.
// ---------------------------------------------------------------------------

export async function getMyProfile(req, res) {
  try {
    const userResult = await query(
      `SELECT id, email, username, full_name, phone_number, phone_verified, is_verified,
              location_country, location_city, primary_role, is_admin, admin_role, status,
              kyc_status, avatar_url, cover_image_url, bio, preferred_language, created_at,
              profile_visibility, show_followers, show_activity, allow_messages_from
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const wallet = await getWallet(user.id);
    const shop = ['seller', 'manufacturer', 'supplier', 'dropshipper', 'farmer'].includes(user.primary_role)
      ? await getShopSummary(user.id) : null;

    let roleProfile = null;
    if (['manufacturer', 'supplier', 'dropshipper', 'farmer'].includes(user.primary_role)) {
      roleProfile = await getBusinessProfileSummary(user.id);
    } else if (user.primary_role === 'delivery') {
      roleProfile = await getDriverSummary(user.id);
    } else if (user.primary_role === 'buyer') {
      roleProfile = await getBuyerStats(user.id);
    }

    const [authorizedRoles, followCounts] = await Promise.all([
      getAuthorizedRoles(user.id, user.primary_role),
      getFollowCounts(user.id)
    ]);

    return res.json({
      user,
      wallet,
      shop,
      roleProfile,
      authorizedRoles,
      ...followCounts,
      verification: { isVerified: isPlatformVerified(user, shop), kycStatus: user.kyc_status }
    });
  } catch (err) {
    console.error('Get my profile error:', err);
    return res.status(500).json({ error: 'Could not load your profile.' });
  }
}

// A deliberately small whitelist — identity/display + privacy fields only.
// Role, verification, KYC, and financial fields are never editable here;
// those go through their own dedicated (and separately audited) flows.
// avatar_url/cover_image_url are intentionally excluded — they're only
// ever set by uploadAvatar/uploadCoverImage below, which validate the
// file itself before touching the database.
const EDITABLE_FIELDS = ['full_name', 'bio', 'username', 'location_city', 'location_country', 'preferred_language'];
const EDITABLE_PRIVACY_FIELDS = ['profile_visibility', 'show_followers', 'show_activity', 'allow_messages_from'];
const PRIVACY_ENUMS = {
  profile_visibility: ['public', 'followers', 'private'],
  allow_messages_from: ['everyone', 'followers', 'no_one']
};

export async function updateMyProfile(req, res) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const field of [...EDITABLE_FIELDS, ...EDITABLE_PRIVACY_FIELDS]) {
    const bodyKey = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // full_name -> fullName
    if (!Object.prototype.hasOwnProperty.call(req.body, bodyKey)) continue;
    const value = req.body[bodyKey];
    if (PRIVACY_ENUMS[field] && !PRIVACY_ENUMS[field].includes(value)) {
      return res.status(400).json({ error: `Invalid value for ${bodyKey}.` });
    }
    sets.push(`${field} = $${i}`);
    values.push(value);
    i += 1;
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No editable fields were provided.' });
  if (Object.prototype.hasOwnProperty.call(req.body, 'fullName') && !String(req.body.fullName || '').trim()) {
    return res.status(400).json({ error: 'Full name cannot be empty.' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'bio') && String(req.body.bio || '').length > 500) {
    return res.status(400).json({ error: 'Bio must be 500 characters or fewer.' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'username')) {
    const username = String(req.body.username || '').trim();
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, dot, underscore).' });
    }
    const taken = await query('SELECT id FROM users WHERE username = $1 AND id <> $2', [username, req.user.id]);
    if (taken.rows.length > 0) return res.status(409).json({ error: 'That username is already taken.' });
  }

  try {
    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, full_name, username, avatar_url, cover_image_url, bio, location_city, location_country,
                 preferred_language, profile_visibility, show_followers, show_activity, allow_messages_from`,
      values
    );
    return res.json({ message: 'Profile updated.', user: result.rows[0] });
  } catch (err) {
    console.error('Update my profile error:', err);
    return res.status(500).json({ error: 'Could not update your profile.' });
  }
}

// ---------------------------------------------------------------------------
// PROFILE PHOTO / COVER PHOTO — realtime, no logout/refresh required.
// After a successful upload: DB is updated, and a 'profile:updated' socket
// event is broadcast so every open surface (chat avatar, Live avatar,
// dashboard avatar, shop profile avatar, the profile page itself) can swap
// the image in place. Reuses the same Cloudinary pipeline and security
// validation every other upload in the platform goes through — this isn't
// a second upload system, just a profile-specific entry point that also
// enforces avatar-appropriate dimensions.
// ---------------------------------------------------------------------------

const MIN_AVATAR_DIMENSION = 128;
const MIN_COVER_WIDTH = 480;

async function handlePhotoUpload(req, res, { field, minWidth, minHeight, folder }) {
  if (!isCloudinaryConfigured()) {
    return res.status(501).json({ error: 'Photo upload is not configured on this server yet.' });
  }
  const file = req.file;
  const userId = req.user.id;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (!file) return res.status(400).json({ error: 'No image was uploaded.' });

  const check = await validateUploadAny(file, ['image'], { userId, ipAddress });
  if (!check.ok) {
    if (check.internalReason) console.warn(`Profile photo upload rejected for user ${userId}:`, check.internalReason);
    return res.status(400).json({ error: check.error });
  }

  try {
    const result = await uploadToCloudinary(file.buffer, file.originalname, 'image', folder);

    if (result.width < minWidth || result.height < minHeight) {
      return res.status(400).json({
        error: `Image is too small. Minimum size is ${minWidth}x${minHeight}px.`
      });
    }

    const column = field === 'avatar' ? 'avatar_url' : 'cover_image_url';
    const updateResult = await query(
      `UPDATE users SET ${column} = $1 WHERE id = $2 RETURNING id, avatar_url, cover_image_url`,
      [result.url, userId]
    );
    const updatedUser = updateResult.rows[0];

    // Realtime fan-out. No per-user room to target reliably here (chat
    // sockets join conversation/delivery rooms, not a stable "user:<id>"
    // room), so this mirrors the existing presence:update pattern — a
    // small, cheap global event every connected client filters on userId.
    const io = getIO();
    if (io) {
      io.emit('profile:updated', {
        userId,
        avatarUrl: updatedUser.avatar_url,
        coverImageUrl: updatedUser.cover_image_url,
        field
      });
    }

    return res.json({ message: `${field === 'avatar' ? 'Profile photo' : 'Cover photo'} updated.`, user: updatedUser });
  } catch (err) {
    console.error(`Profile ${field} upload error:`, err);
    recordSecurityEvent({
      eventType: 'upload_rejected', severity: 1, userId, ipAddress,
      summary: `${field} upload failed after passing validation.`, metadata: { message: err.message }
    });
    return res.status(500).json({ error: 'Could not upload the image. Please try again.' });
  }
}

export async function uploadAvatar(req, res) {
  return handlePhotoUpload(req, res, {
    field: 'avatar', minWidth: MIN_AVATAR_DIMENSION, minHeight: MIN_AVATAR_DIMENSION, folder: 'jedida-marketplace/avatars'
  });
}

export async function uploadCoverImage(req, res) {
  return handlePhotoUpload(req, res, {
    field: 'cover', minWidth: MIN_COVER_WIDTH, minHeight: 1, folder: 'jedida-marketplace/covers'
  });
}

// ---------------------------------------------------------------------------
// PUBLIC PROFILE — the safe subset shown to other people. Never includes
// email, phone, wallet balance, KYC documents, national ID, or any
// dispute/fraud detail. Respects profile_visibility and blocking.
// ---------------------------------------------------------------------------

export async function getPublicProfile(req, res) {
  const { userId } = req.params;
  const viewerId = req.user?.id || null;
  try {
    const userResult = await query(
      `SELECT id, username, full_name, avatar_url, cover_image_url, bio, location_city, location_country,
              primary_role, is_verified, created_at, profile_visibility, show_followers, show_activity
       FROM users WHERE id = $1 AND status = 'active'`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (viewerId && await isBlockedEitherWay(viewerId, user.id)) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let isFollowing = false;
    if (viewerId && viewerId !== user.id) {
      const followCheck = await query(
        'SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2', [viewerId, user.id]
      );
      isFollowing = followCheck.rows.length > 0;
    }

    const isOwner = viewerId === user.id;
    const isPrivate = user.profile_visibility === 'private' && !isOwner && !isFollowing;
    const followersHidden = !user.show_followers && !isOwner;

    const shop = ['seller', 'manufacturer', 'supplier', 'dropshipper', 'farmer'].includes(user.primary_role)
      ? await getShopSummary(user.id) : null;

    const base = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      coverImageUrl: user.cover_image_url,
      locationCity: user.location_city,
      locationCountry: user.location_country,
      primaryRole: user.primary_role,
      isVerified: isPlatformVerified(user, shop),
      memberSince: user.created_at,
      isFollowing,
      isOwner
    };

    if (isPrivate) {
      return res.json({ user: base, isPrivate: true });
    }

    const [authorizedRoles, followCounts] = await Promise.all([
      getAuthorizedRoles(user.id, user.primary_role),
      getFollowCounts(user.id)
    ]);

    let publicRoleInfo = null;
    if (['manufacturer', 'supplier', 'farmer'].includes(user.primary_role)) {
      const bp = await getBusinessProfileSummary(user.id);
      publicRoleInfo = bp && { businessType: bp.business_type, companyName: bp.company_name, verificationLevel: bp.verification_level };
    } else if (user.primary_role === 'delivery') {
      const driver = await getDriverSummary(user.id);
      publicRoleInfo = driver && { rating: driver.rating, completedDeliveries: driver.completedDeliveries };
    }

    return res.json({
      user: { ...base, bio: user.bio },
      shop,
      publicRoleInfo,
      authorizedRoles,
      followerCount: followersHidden ? null : followCounts.followerCount,
      followingCount: followersHidden ? null : followCounts.followingCount,
      showActivity: user.show_activity || isOwner,
      isPrivate: false
    });
  } catch (err) {
    console.error('Get public profile error:', err);
    return res.status(500).json({ error: 'Could not load this profile.' });
  }
}

// ---------------------------------------------------------------------------
// FOLLOW SYSTEM
// ---------------------------------------------------------------------------

export async function followUser(req, res) {
  const followerId = req.user.id;
  const { userId: followingId } = req.params;
  if (followerId === followingId) return res.status(400).json({ error: 'You cannot follow yourself.' });

  try {
    const targetResult = await query(`SELECT id, full_name FROM users WHERE id = $1 AND status = 'active'`, [followingId]);
    if (!targetResult.rows[0]) return res.status(404).json({ error: 'User not found.' });

    if (await isBlockedEitherWay(followerId, followingId)) {
      return res.status(403).json({ error: 'You cannot follow this user.' });
    }

    await query(
      `INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)
       ON CONFLICT (follower_id, following_id) DO NOTHING`,
      [followerId, followingId]
    );

    const followerResult = await query('SELECT full_name FROM users WHERE id = $1', [followerId]);
    const followerName = followerResult.rows[0]?.full_name || 'Someone';
    const notif = await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, 'new_follower', 'New follower', $2, $3) RETURNING *`,
      [followingId, `${followerName} started following you.`, JSON.stringify({ followerId })]
    );
    const io = getIO();
    if (io) io.emit('notification:new', notif.rows[0]);
    sendPushToUser(followingId, { title: 'New follower', body: `${followerName} started following you.`, data: { type: 'follow', followerId } });

    return res.json({ message: 'Followed.', isFollowing: true });
  } catch (err) {
    console.error('Follow user error:', err);
    return res.status(500).json({ error: 'Could not follow this user.' });
  }
}

export async function unfollowUser(req, res) {
  const followerId = req.user.id;
  const { userId: followingId } = req.params;
  try {
    await query('DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2', [followerId, followingId]);
    return res.json({ message: 'Unfollowed.', isFollowing: false });
  } catch (err) {
    console.error('Unfollow user error:', err);
    return res.status(500).json({ error: 'Could not unfollow this user.' });
  }
}

async function listFollowRelation({ column, joinColumn }, req, res) {
  const { userId } = req.params;
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 30, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * pageSize;
  try {
    const result = await query(
      `SELECT u.id, u.username, u.full_name, u.avatar_url, u.primary_role, u.is_verified
       FROM user_follows f JOIN users u ON u.id = f.${joinColumn}
       WHERE f.${column} = $1 AND u.status = 'active'
       ORDER BY f.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    );
    return res.json({ users: result.rows, page, pageSize });
  } catch (err) {
    console.error('List follow relation error:', err);
    return res.status(500).json({ error: 'Could not load this list.' });
  }
}

export async function getFollowers(req, res) {
  return listFollowRelation({ column: 'following_id', joinColumn: 'follower_id' }, req, res);
}

export async function getFollowing(req, res) {
  return listFollowRelation({ column: 'follower_id', joinColumn: 'following_id' }, req, res);
}

// ---------------------------------------------------------------------------
// BLOCK / REPORT — blocking reuses chat_blocks (schema_phase35): a block is
// platform-wide, not a separate profile-only relationship. Unfollows both
// directions on block, since a block should not leave a dangling follow.
// ---------------------------------------------------------------------------

export async function blockProfileUser(req, res) {
  const blockerId = req.user.id;
  const { userId: blockedId } = req.params;
  if (blockerId === blockedId) return res.status(400).json({ error: 'You cannot block yourself.' });
  try {
    await blockUserRow({ blockerId, blockedId, reason: req.body?.reason });
    await query(
      `DELETE FROM user_follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`,
      [blockerId, blockedId]
    );
    return res.json({ message: 'User blocked.' });
  } catch (err) {
    console.error('Block user error:', err);
    return res.status(500).json({ error: 'Could not block this user.' });
  }
}

export async function unblockProfileUser(req, res) {
  const blockerId = req.user.id;
  const { userId: blockedId } = req.params;
  try {
    await unblockUserRow({ blockerId, blockedId });
    return res.json({ message: 'User unblocked.' });
  } catch (err) {
    console.error('Unblock user error:', err);
    return res.status(500).json({ error: 'Could not unblock this user.' });
  }
}

export async function myBlockedUsers(req, res) {
  try {
    const blocked = await listBlockedUsers(req.user.id);
    return res.json({ users: blocked });
  } catch (err) {
    console.error('List blocked users error:', err);
    return res.status(500).json({ error: 'Could not load your blocked users.' });
  }
}

const REPORT_REASONS = ['fake_profile', 'impersonation', 'scam', 'harassment', 'hate_speech', 'inappropriate_content', 'other'];

export async function reportProfileUser(req, res) {
  const reporterId = req.user.id;
  const { userId: reportedUserId } = req.params;
  const { reason, details } = req.body || {};
  if (reporterId === reportedUserId) return res.status(400).json({ error: 'You cannot report yourself.' });
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Invalid report reason.' });
  try {
    const target = await query(`SELECT id FROM users WHERE id = $1`, [reportedUserId]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found.' });

    const result = await query(
      `INSERT INTO user_reports (reporter_id, reported_user_id, reason, details) VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
      [reporterId, reportedUserId, reason, details || null]
    );
    return res.status(201).json({ message: 'Report submitted. Our team will review it.', report: result.rows[0] });
  } catch (err) {
    console.error('Report user error:', err);
    return res.status(500).json({ error: 'Could not submit this report.' });
  }
}
