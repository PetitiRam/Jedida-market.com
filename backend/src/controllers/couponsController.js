import { query } from '../config/db.js';

export async function createCoupon(req, res) {
  const { code, discountType, discountValue, minOrderAmount, maxUses, expiresAt } = req.body;
  const shop = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
  if (shop.rows.length === 0) return res.status(403).json({ error: 'You need a shop to create coupons.' });

  try {
    const result = await query(
      `INSERT INTO coupons (shop_id, code, discount_type, discount_value, min_order_amount, max_uses, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [shop.rows[0].id, code.toUpperCase(), discountType, discountValue, minOrderAmount || 0, maxUses || null, expiresAt || null, req.user.id]
    );
    res.status(201).json({ message: 'Coupon created.', coupon: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A coupon with this code already exists for your shop.' });
    res.status(500).json({ error: 'Could not create coupon.' });
  }
}

export async function myCoupons(req, res) {
  const shop = await query('SELECT id FROM shops WHERE owner_id = $1', [req.user.id]);
  if (shop.rows.length === 0) return res.json({ coupons: [] });
  const result = await query('SELECT * FROM coupons WHERE shop_id = $1 ORDER BY created_at DESC', [shop.rows[0].id]);
  res.json({ coupons: result.rows });
}

// Validates a coupon against a cart total for a specific shop and returns
// the discount amount — does NOT redeem it yet (redemption happens at
// checkout confirmation so an abandoned cart doesn't burn a use).
export async function validateCoupon(req, res) {
  const { code, shopId, subtotal } = req.body;

  const result = await query(
    `SELECT * FROM coupons WHERE code = $1 AND (shop_id = $2 OR shop_id IS NULL) AND is_active = TRUE
     AND (expires_at IS NULL OR expires_at > now()) AND (max_uses IS NULL OR uses_count < max_uses)`,
    [code.toUpperCase(), shopId]
  );
  const coupon = result.rows[0];
  if (!coupon) return res.status(404).json({ error: 'Invalid or expired coupon code.' });
  if (Number(subtotal) < Number(coupon.min_order_amount)) {
    return res.status(400).json({ error: `This coupon requires a minimum order of ${coupon.min_order_amount}.` });
  }

  const discount = coupon.discount_type === 'percent'
    ? Math.round(subtotal * (coupon.discount_value / 100) * 100) / 100
    : Math.min(Number(coupon.discount_value), subtotal);

  res.json({ valid: true, coupon, discount });
}
