import { query } from '../config/db.js';
import { polishListing } from '../services/nsubugaJosephBot.js';
import { distanceKmExpr, parseCoords } from '../utils/geo.js';
import { logSecurityEvent } from '../services/securityLogService.js';

async function getOwnedShopId(userId) {
  const result = await query('SELECT id FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

// Create a new listing. Runs it through "Nsubuga Joseph" (the listing-polish
// bot) before it goes to pending_review, then a human admin still approves it.
export async function createProduct(req, res) {

const {

title,
shortDescription,
description,

category,
condition,

brand,
manufacturer,
modelNumber,
sku,

price,
originalPrice,
discount,
currency,

quantityAvailable,
minimumOrderQuantity,

material,
color,
size,
weight,
dimensions,

warranty,
countryOfOrigin,

warehouseLocation,
deliveryTime,
shippingCost,

locationCity,
locationCountry,

features,
packageContents,

keywords,
metaTitle,
metaDescription,

media,
images,

status,

// Wholesale-catalog fields (schema_phase38) — meaningful for a
// manufacturer/supplier listing that can be sourced/imported by
// sellers/dropshippers/suppliers; ignored (left at defaults) for a
// normal seller listing.
isSourceable,
wholesalePrice

} = req.body;


if (!title || !price) {
return res.status(400).json({
error:'Title and price are required.'
});
}

// A listing's moderation status is decided by admin review, not by the
// seller submitting it — only allow the seller to request 'draft' or the
// normal 'pending_review' path here; anything else (active, approved,
// rejected, suspended, ...) is ignored in favor of the safe default.
const SELLER_ALLOWED_CREATE_STATUSES = ['draft', 'pending_review'];
const safeStatus = (!req.user.isAdmin && status && !SELLER_ALLOWED_CREATE_STATUSES.includes(status))
  ? 'pending_review'
  : status;

try {


const shopId = await getOwnedShopId(req.user.id);


if(!shopId){

return res.status(403).json({
error:'Open your shop before listing products.'
});

}



const polished = await polishListing({

title,
description,
category

});



const result = await query(
`
INSERT INTO products (

shop_id,

title,
short_description,
description,

category,
condition,

brand,
manufacturer,
model_number,
sku,

price,
original_price,
discount,
currency,

quantity_available,
minimum_order_quantity,

images,

specs,

location_city,
location_country,

shipping_options,

status,

ai_polished,
ai_polish_notes,

is_sourceable,
wholesale_price

)

VALUES (

$1,$2,$3,$4,

$5,$6,

$7,$8,$9,$10,

$11,$12,$13,$14,

$15,$16,

$17,

$18,

$19,$20,

$21,

$22,

$23,$24,

$25,$26

)

RETURNING *
`,
[
shopId,

polished.title || title,
shortDescription || null,
polished.description || description,

category || 'other',
condition || 'new',

brand || null,
manufacturer || null,
modelNumber || null,
sku || null,

Number(price),
Number(originalPrice || 0),
Number(discount || 0),
currency || 'USD',

Number(quantityAvailable || 1),
Number(minimumOrderQuantity || 1),


images || [],


JSON.stringify({

material,
color,
size,
weight,
dimensions,
warranty,
countryOfOrigin,

features,
packageContents,

keywords,
metaTitle,
metaDescription

}),


locationCity || null,
locationCountry || null,


JSON.stringify({

warehouseLocation,
deliveryTime,
shippingCost

}),


safeStatus || 'pending_review',

true,

polished.notes || null,

// Only a manufacturer, supplier, or farmer account can publish into the
// wholesale/sourceable catalog — a seller/dropshipper/delivery
// user sending this flag is silently ignored rather than erroring,
// consistent with how safeStatus above handles an over-reaching value.
['manufacturer', 'supplier', 'farmer'].includes(req.user.role) ? Boolean(isSourceable) : false,
wholesalePrice ? Number(wholesalePrice) : null

]
);


return res.status(201).json({

message:
'Listing created and sent for review.',

product:
result.rows[0]

});


}

catch(err){

console.error(
'Create product error:',
err
);


return res.status(500).json({

error:'Could not create listing.'

});

}


}
export async function updateProduct(req, res) {
  const { id } = req.params;
  const fields = req.body;
  const allowed = ['title', 'short_description', 'description', 'category', 'condition',
    'brand', 'manufacturer', 'model_number', 'sku',
    'price', 'original_price', 'discount', 'currency',
    'quantity_available', 'minimum_order_quantity', 'images', 'video_url', 'specs',
    'location_city', 'location_country', 'shipping_options', 'status'];

  // Wholesale-catalog fields only make sense — and are only writable — for
  // a manufacturer/supplier/farmer's own listings (mirrors createProduct's guard).
  if (['manufacturer', 'supplier', 'farmer'].includes(req.user.role)) {
    allowed.push('is_sourceable', 'wholesale_price', 'lead_time_days');
  }
  // quality_grade/harvest_date (schema_phase45) are agriculture-specific but
  // harmless on any listing, so they're editable by anyone who owns the row.
  allowed.push('quality_grade', 'harvest_date');

  // Only admins can move a listing into a published/moderated state
  // (active, rejected, suspended, approved) — that decision belongs to the
  // review workflow in adminController, not to the listing owner. Sellers
  // may still save/unsave a draft or resubmit for review, which is what
  // the seller UI actually needs `status` for.
  const SELLER_ALLOWED_STATUSES = ['draft', 'pending_review'];
  if (Object.prototype.hasOwnProperty.call(fields, 'status') && !req.user.isAdmin) {
    if (!SELLER_ALLOWED_STATUSES.includes(fields.status)) {
      return res.status(403).json({ error: 'You cannot set a listing to that status.' });
    }
  }

  const shopId = await getOwnedShopId(req.user.id);
  if (!shopId) return res.status(403).json({ error: 'You do not have a shop.' });

  const sets = [];
  const values = [];
  let i = 1;
  for (const key of Object.keys(fields)) {
    const column = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    if (allowed.includes(column)) {
      sets.push(`${column} = $${i}`);
      values.push(fields[key]);
      i += 1;
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update.' });

  try {
    values.push(id, shopId);
    const before = await query('SELECT price FROM products WHERE id = $1 AND shop_id = $2', [id, shopId]);
    const result = await query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${i} AND shop_id = $${i + 1} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found in your shop.' });

    // Stage 3 trust/security tracking: every listing edit is logged, with a
    // dedicated event (and before/after values) when the price itself moved.
    const oldPrice = before.rows[0]?.price;
    const newPrice = result.rows[0].price;
    if (Object.prototype.hasOwnProperty.call(fields, 'price') && Number(oldPrice) !== Number(newPrice)) {
      await logSecurityEvent(null, {
        actorId: req.user.id, actorRole: req.user.role, eventType: 'product_price_changed',
        entityType: 'product', entityId: id, metadata: { from: oldPrice, to: newPrice }
      });
    }
    await logSecurityEvent(null, {
      actorId: req.user.id, actorRole: req.user.role, eventType: 'product_updated',
      entityType: 'product', entityId: id, metadata: { fields: Object.keys(fields) }
    });

    return res.json({ message: 'Listing updated.', product: result.rows[0] });
  } catch (err) {
    console.error('Update product error:', err);
    return res.status(500).json({ error: 'Could not update listing.' });
  }
}

export async function deleteProduct(req, res) {
  const { id } = req.params;
  const shopId = await getOwnedShopId(req.user.id);
  if (!shopId) return res.status(403).json({ error: 'You do not have a shop.' });

  try {
    const result = await query('DELETE FROM products WHERE id = $1 AND shop_id = $2 RETURNING id', [id, shopId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found in your shop.' });
    return res.json({ message: 'Listing removed.' });
  } catch (err) {
    console.error('Delete product error:', err);
    return res.status(500).json({ error: 'Could not remove listing.' });
  }
}

// "Down the seller should be able to see his/her own listed products"
export async function myProducts(req, res) {
  try {
    const shopId = await getOwnedShopId(req.user.id);
    if (!shopId) return res.json({ products: [] });
    const result = await query('SELECT * FROM products WHERE shop_id = $1 ORDER BY created_at DESC', [shopId]);
    return res.json({ products: result.rows });
  } catch (err) {
    console.error('My products error:', err);
    return res.status(500).json({ error: 'Could not load your products.' });
  }
}

// Main Marketplace feed — "All Products" tab, with category filter and
// trending/popular/high-demand sorting for the buyer dashboard.
export async function browseProducts(req, res) {
  const { category, sort = 'newest', limit = 40, page = 1, search, dealsOnly, featuredOnly, trendingOnly, lat, lng } = req.query;
  // Capped so a client can't force an expensive unbounded scan; page is
  // 1-indexed and clamped to something sane rather than trusting raw input.
  const pageSize = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const offset = (pageNum - 1) * pageSize;

  const conditions = [`p.status = 'active'`];
  const values = [];
  let i = 1;

  if (category) {
    conditions.push(`p.category = $${i}`);
    values.push(category);
    i += 1;
  }

  if (search) {
    conditions.push(`(p.title ILIKE $${i} OR p.short_description ILIKE $${i} OR p.brand ILIKE $${i})`);
    values.push(`%${search}%`);
    i += 1;
  }

  if (dealsOnly === 'true' || sort === 'deals') {
    conditions.push(`p.original_price > p.price`);
  }

  // Lets a "View all" section page show exactly the curated set (only
  // products an admin/AI actually marked featured/trending), not the whole
  // catalogue merely reordered — those flags already exist on the row.
  if (featuredOnly === 'true') {
    conditions.push(`p.is_featured = TRUE`);
  }
  if (trendingOnly === 'true') {
    conditions.push(`p.is_trending = TRUE`);
  }

  // Buyer's coordinates, captured silently by the browser's Geolocation
  // API on the frontend — never a manually typed/selected location.
  const coords = parseCoords(lat, lng);
  let distanceSelect = 'NULL AS distance_km';
  let latIdx, lngIdx;
  if (coords) {
    latIdx = i; values.push(coords.lat); i += 1;
    lngIdx = i; values.push(coords.lng); i += 1;
    distanceSelect = `${distanceKmExpr(latIdx, lngIdx)} AS distance_km`;
  }

  // Verified Shop priority ranking (Phase E growth benefit): a Verified
  // shop's listings rank ahead of unverified shops' within every sort mode
  // that isn't an explicit price sort — a buyer who asks for cheapest/
  // priciest first gets exactly that, since reordering by verification
  // there would defeat the point of the sort they chose.
  const VERIFIED_BOOST = 's.is_verified DESC, ';
  const orderBy = {
    newest: `${VERIFIED_BOOST}p.created_at DESC`,
    trending: `${VERIFIED_BOOST}p.is_trending DESC, p.views_count DESC`,
    popular: `${VERIFIED_BOOST}p.orders_count DESC`,
    high_demand: `${VERIFIED_BOOST}p.orders_count DESC, p.views_count DESC`,
    price_low: 'p.price ASC',
    price_high: 'p.price DESC',
    featured: `${VERIFIED_BOOST}p.is_featured DESC, p.created_at DESC`,
    deals: `${VERIFIED_BOOST}(p.original_price - p.price) DESC, p.created_at DESC`,
    // Only meaningful once coordinates are present; falls back to newest
    // below if a client asks for it without sending lat/lng.
    nearest: coords ? `${VERIFIED_BOOST}distance_km ASC NULLS LAST, p.created_at DESC` : `${VERIFIED_BOOST}p.created_at DESC`
  }[sort] || `${VERIFIED_BOOST}p.created_at DESC`;

  const limitIdx = i; values.push(pageSize); i += 1;
  const offsetIdx = i; values.push(offset); i += 1;

  try {
    // COUNT(*) OVER() rides along on the same indexed scan instead of a
    // separate COUNT(*) query — one round trip gets both the page of rows
    // and the total needed to render "page 3 of 12" / a "load more" button.
    const result = await query(
      `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status, s.is_verified AS shop_is_verified, ${distanceSelect},
              COUNT(*) OVER() AS total_count
       FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );
    const total = Number(result.rows[0]?.total_count || 0);
    const products = result.rows.map(({ total_count, ...rest }) => rest);
    return res.json({
      products,
      pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize), hasMore: offset + products.length < total }
    });
  } catch (err) {
    console.error('Browse products error:', err);
    return res.status(500).json({ error: 'Could not load products.' });
  }
}

// Agriculture tab — "agriculture is the backbone of our country"
// Enriched by schema_phase45 with quality_grade/harvest_date (on products)
// and the supplying business's supply_reliability_score (farm_profiles) —
// joined in, not forked into a second endpoint.
export async function browseAgriculture(req, res) {
  try {
    const result = await query(
      `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.owner_id AS business_user_id,
              bp.company_name, fp.supply_reliability_score
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       LEFT JOIN business_profiles bp ON bp.user_id = s.owner_id AND bp.status = 'active'
       LEFT JOIN farm_profiles fp ON fp.business_profile_id = bp.id
       WHERE p.status = 'active' AND p.category = 'agriculture'
       ORDER BY p.created_at DESC LIMIT 60`
    );
    return res.json({ products: result.rows });
  } catch (err) {
    console.error('Browse agriculture error:', err);
    return res.status(500).json({ error: 'Could not load agricultural products.' });
  }
}

export async function getProductById(req, res) {
  try {
    const result = await query(
      `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.logo_url AS shop_logo,
              s.is_verified AS shop_is_verified, s.verified_since AS shop_verified_since,
              u.primary_role AS shop_owner_role,
              (SELECT bp.status FROM business_profiles bp WHERE bp.user_id = s.owner_id ORDER BY bp.created_at DESC LIMIT 1) AS business_verification_status
       FROM products p JOIN shops s ON s.id = p.shop_id JOIN users u ON u.id = s.owner_id WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found.' });
    await query('UPDATE products SET views_count = views_count + 1 WHERE id = $1', [req.params.id]);
    return res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Get product error:', err);
    return res.status(500).json({ error: 'Could not load product.' });
  }
}
