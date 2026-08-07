import { query } from '../config/db.js';

// ---------------------------------------------------------------------------
// Shared helpers — every block here reads from tables that already exist
// per role (business_profiles, drivers, shops, wallets, orders...) rather
// than duplicating any of that data onto the profile itself.
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

// ---------------------------------------------------------------------------
// OWN PROFILE — full picture, gated behind auth. Every field here is either
// the user's own identity data or something they're entitled to see about
// their own account (wallet balance, KYC status, dispute count).
// ---------------------------------------------------------------------------

export async function getMyProfile(req, res) {
  try {
    const userResult = await query(
      `SELECT id, email, username, full_name, phone_number, phone_verified, is_verified,
              location_country, location_city, primary_role, is_admin, admin_role, status,
              kyc_status, avatar_url, cover_image_url, bio, preferred_language, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const wallet = await getWallet(user.id);
    const shop = ['seller', 'manufacturer', 'supplier', 'dropshipper'].includes(user.primary_role)
      ? await getShopSummary(user.id) : null;

    let roleProfile = null;
    if (['manufacturer', 'supplier', 'dropshipper'].includes(user.primary_role)) {
      roleProfile = await getBusinessProfileSummary(user.id);
    } else if (user.primary_role === 'delivery') {
      roleProfile = await getDriverSummary(user.id);
    } else if (user.primary_role === 'buyer') {
      roleProfile = await getBuyerStats(user.id);
    }

    return res.json({ user, wallet, shop, roleProfile });
  } catch (err) {
    console.error('Get my profile error:', err);
    return res.status(500).json({ error: 'Could not load your profile.' });
  }
}

// A deliberately small whitelist — identity/display fields only. Role,
// verification, KYC, and financial fields are never editable here; those
// go through their own dedicated (and separately audited) flows.
const EDITABLE_FIELDS = ['full_name', 'avatar_url', 'cover_image_url', 'bio'];

export async function updateMyProfile(req, res) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const field of EDITABLE_FIELDS) {
    const bodyKey = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // full_name -> fullName
    if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
      sets.push(`${field} = $${i}`);
      values.push(req.body[bodyKey]);
      i += 1;
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No editable fields were provided.' });
  if (Object.prototype.hasOwnProperty.call(req.body, 'fullName') && !String(req.body.fullName || '').trim()) {
    return res.status(400).json({ error: 'Full name cannot be empty.' });
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'bio') && String(req.body.bio || '').length > 500) {
    return res.status(400).json({ error: 'Bio must be 500 characters or fewer.' });
  }

  try {
    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, full_name, avatar_url, cover_image_url, bio`,
      values
    );
    return res.json({ message: 'Profile updated.', user: result.rows[0] });
  } catch (err) {
    console.error('Update my profile error:', err);
    return res.status(500).json({ error: 'Could not update your profile.' });
  }
}

// ---------------------------------------------------------------------------
// PUBLIC PROFILE — the safe subset shown to other people (e.g. clicking a
// reviewer's name, or a delivery partner's card). Never includes email,
// phone, wallet balance, KYC status, or any dispute/fraud detail.
// ---------------------------------------------------------------------------

export async function getPublicProfile(req, res) {
  const { userId } = req.params;
  try {
    const userResult = await query(
      `SELECT id, username, full_name, avatar_url, cover_image_url, bio, location_city, location_country,
              primary_role, is_verified, created_at
       FROM users WHERE id = $1 AND status = 'active'`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const shop = ['seller', 'manufacturer', 'supplier', 'dropshipper'].includes(user.primary_role)
      ? await getShopSummary(user.id) : null;

    let publicRoleInfo = null;
    if (['manufacturer', 'supplier'].includes(user.primary_role)) {
      const bp = await getBusinessProfileSummary(user.id);
      publicRoleInfo = bp && { businessType: bp.business_type, companyName: bp.company_name, verificationLevel: bp.verification_level };
    } else if (user.primary_role === 'delivery') {
      const driver = await getDriverSummary(user.id);
      publicRoleInfo = driver && { rating: driver.rating, completedDeliveries: driver.completedDeliveries };
    }

    return res.json({ user, shop, publicRoleInfo });
  } catch (err) {
    console.error('Get public profile error:', err);
    return res.status(500).json({ error: 'Could not load this profile.' });
  }
}
