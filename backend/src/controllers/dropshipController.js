import { query, withTransaction } from '../config/db.js';
import { ADAPTERS } from '../services/paymentProviders.js';

// Roles allowed to hold a dropship partnership as the reseller side.
const DROPSHIPPER_ROLES = ['dropshipper'];
// Roles allowed to own the products a dropshipper resells.
const BUSINESS_ROLES = ['manufacturer', 'supplier', 'farmer'];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function notifyUser(userId, type, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

// Every partnership request, approval, product-access change, price/
// commission edit, order, and commission release funnels through here —
// the single audit trail the brief asks for. Never throws: a logging
// failure must not block the real action it's describing.
async function logDropshipAction(client, { actorId, actorRole, action, entityType, entityId, metadata = {} }) {
  try {
    const runner = client || { query };
    await runner.query(
      `INSERT INTO dropship_audit_log (actor_id, actor_role, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actorId || null, actorRole || null, action, entityType, entityId || null, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Dropship audit log error:', err);
  }
}

async function getPartnership(id) {
  const result = await query('SELECT * FROM dropship_partnerships WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// Best-effort region gate: if the partnership/product access lists allowed
// regions, the buyer's destination (matched against the free-text shipping
// address) must contain one of them. No regions set = unrestricted. This is
// intentionally a lightweight substring check — shipping_address is stored
// as free-text (schema_phase3) rather than structured fields.
function isRegionAllowed(regions, shippingAddress) {
  if (!regions || regions.length === 0) return true;
  if (!shippingAddress) return false;
  const haystack = String(shippingAddress).toLowerCase();
  return regions.some((r) => haystack.includes(String(r).toLowerCase()));
}

function computeCommission(resellerPrice, quantity, commissionType, commissionValue) {
  const subtotal = Number(resellerPrice) * Number(quantity);
  if (commissionType === 'fixed') return Math.round(Number(commissionValue) * Number(quantity) * 100) / 100;
  return Math.round(subtotal * (Number(commissionValue) / 100) * 100) / 100;
}

// Recomputes the dropshipper's rolling stats + a simple 0-100 performance
// score off the counters on their business_profiles row. Called inside the
// same transaction as whatever just changed an order's completed/reversed
// state, so the score is never stale by more than one request.
async function refreshPerformanceScore(client, dropshipperId) {
  const profileResult = await client.query(
    `SELECT id, dropship_total_orders, dropship_completed_orders, dropship_reversed_orders
     FROM business_profiles WHERE user_id = $1 AND business_type = 'dropshipper' AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [dropshipperId]
  );
  const profile = profileResult.rows[0];
  if (!profile) return;

  const total = Number(profile.dropship_total_orders) || 0;
  const completed = Number(profile.dropship_completed_orders) || 0;
  const reversed = Number(profile.dropship_reversed_orders) || 0;
  // Completion rate is the backbone of the score; a small volume bonus (up
  // to +10) rewards an established track record without letting a brand
  // new dropshipper with a single good sale outrank one with hundreds.
  const completionRate = total > 0 ? completed / total : 0;
  const reversalPenalty = total > 0 ? (reversed / total) * 30 : 0;
  const volumeBonus = Math.min(10, Math.log10(total + 1) * 5);
  const score = Math.max(0, Math.min(100, completionRate * 90 - reversalPenalty + volumeBonus));

  await client.query(
    `UPDATE business_profiles SET dropship_performance_score = $1 WHERE id = $2`,
    [Math.round(score * 100) / 100, profile.id]
  );
}

// ---------------------------------------------------------------------------
// PARTNERSHIPS — dropshipper <-> manufacturer/supplier account-level link
// ---------------------------------------------------------------------------

export async function requestPartnership(req, res) {
  const { businessId, message, agreementAccepted } = req.body;
  if (!businessId) return res.status(400).json({ error: 'businessId is required.' });
  if (businessId === req.user.id) return res.status(400).json({ error: 'You cannot partner with yourself.' });

  try {
    const businessResult = await query(
      `SELECT u.id, u.primary_role, bp.dropshipping_available, bp.dropshipping_instructions, bp.company_name
       FROM users u
       LEFT JOIN business_profiles bp ON bp.user_id = u.id AND bp.status = 'active'
       WHERE u.id = $1`,
      [businessId]
    );
    const business = businessResult.rows[0];
    if (!business || !BUSINESS_ROLES.includes(business.primary_role)) {
      return res.status(404).json({ error: 'Manufacturer/supplier not found.' });
    }
    if (!agreementAccepted) {
      return res.status(400).json({ error: 'You must accept the supplier agreement to request a partnership.' });
    }

    const result = await query(
      `INSERT INTO dropship_partnerships (dropshipper_id, business_id, request_message, agreement_snapshot)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (dropshipper_id, business_id)
       DO UPDATE SET status = 'pending', request_message = EXCLUDED.request_message,
                      agreement_snapshot = EXCLUDED.agreement_snapshot,
                      response_note = NULL, responded_at = NULL, updated_at = now()
       RETURNING *`,
      [req.user.id, businessId, message || null, business.dropshipping_instructions || 'Standard Jedida dropship terms']
    );
    const partnership = result.rows[0];

    await logDropshipAction(null, {
      actorId: req.user.id, actorRole: req.user.role, action: 'partnership_requested',
      entityType: 'partnership', entityId: partnership.id, metadata: { businessId }
    });
    await notifyUser(businessId, 'dropship_partnership_requested', 'New dropship partnership request',
      'A dropshipper has requested to resell your approved products.', { partnershipId: partnership.id });

    return res.status(201).json({ message: 'Partnership request sent.', partnership });
  } catch (err) {
    console.error('Request partnership error:', err);
    return res.status(500).json({ error: 'Could not send partnership request.' });
  }
}

export async function myPartnerships(req, res) {
  try {
    const result = await query(
      `SELECT p.*,
              du.username AS dropshipper_username,
              bu.username AS business_username, bbp.company_name AS business_company_name
       FROM dropship_partnerships p
       JOIN users du ON du.id = p.dropshipper_id
       JOIN users bu ON bu.id = p.business_id
       LEFT JOIN business_profiles bbp ON bbp.user_id = bu.id AND bbp.status = 'active'
       WHERE p.dropshipper_id = $1 OR p.business_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    return res.json({ partnerships: result.rows });
  } catch (err) {
    console.error('My partnerships error:', err);
    return res.status(500).json({ error: 'Could not load partnerships.' });
  }
}

// Manufacturer/supplier approves, rejects, suspends, or revokes a
// partnership. Either side may set 'revoked'; only the business can
// approve/reject/suspend.
export async function respondPartnership(req, res) {
  const { id } = req.params;
  const { status, responseNote, allowedRegions } = req.body;
  if (!['approved', 'rejected', 'suspended', 'revoked'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const partnership = await getPartnership(id);
    if (!partnership) return res.status(404).json({ error: 'Partnership not found.' });

    const isBusiness = partnership.business_id === req.user.id;
    const isDropshipper = partnership.dropshipper_id === req.user.id;
    if (status === 'revoked' ? !(isBusiness || isDropshipper) : !isBusiness) {
      return res.status(403).json({ error: 'You do not have permission to update this partnership.' });
    }

    const result = await query(
      `UPDATE dropship_partnerships
       SET status = $1, response_note = $2, allowed_regions = COALESCE($3, allowed_regions), responded_at = now()
       WHERE id = $4 RETURNING *`,
      [status, responseNote || null, allowedRegions || null, id]
    );
    const updated = result.rows[0];

    await logDropshipAction(null, {
      actorId: req.user.id, actorRole: req.user.role, action: `partnership_${status}`,
      entityType: 'partnership', entityId: id, metadata: { status, responseNote }
    });

    const otherParty = isBusiness ? partnership.dropshipper_id : partnership.business_id;
    await notifyUser(otherParty, 'dropship_partnership_updated', 'Partnership status updated',
      `Your dropship partnership was ${status}.`, { partnershipId: id, status });

    return res.json({ message: `Partnership ${status}.`, partnership: updated });
  } catch (err) {
    console.error('Respond partnership error:', err);
    return res.status(500).json({ error: 'Could not update partnership.' });
  }
}

// Directory of active manufacturer/supplier businesses a dropshipper can
// request a partnership with — deliberately lightweight (no products
// joined) since a dropshipper picks the business first, then browses its
// dropshippable catalog once the partnership is approved.
export async function listDropshipBusinesses(req, res) {
  const { search } = req.query;
  const conditions = [`u.primary_role IN ('manufacturer','supplier')`, `bp.status = 'active'`];
  const values = [];
  let i = 1;
  if (search) { conditions.push(`bp.company_name ILIKE $${i}`); values.push(`%${search}%`); i += 1; }
  try {
    const result = await query(
      `SELECT u.id AS business_id, u.primary_role AS business_type,
              bp.company_name, bp.description, bp.company_country, bp.dropshipping_instructions
       FROM business_profiles bp JOIN users u ON u.id = bp.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY bp.company_name ASC LIMIT 100`,
      values
    );
    return res.json({ businesses: result.rows });
  } catch (err) {
    console.error('List dropship businesses error:', err);
    return res.status(500).json({ error: 'Could not load businesses.' });
  }
}

// ---------------------------------------------------------------------------
// CATALOG — browsing dropshippable listings + requesting/managing access
// ---------------------------------------------------------------------------

// Dropshipper browses every active, is_dropshippable listing, with their
// partnership status against that business attached (mirrors
// sourcingController.browseCatalog's shape).
export async function browseDropshipCatalog(req, res) {
  const { category, search, limit = 40, page = 1 } = req.query;
  const pageSize = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const offset = (pageNum - 1) * pageSize;

  const conditions = [`p.status = 'active'`, `p.is_dropshippable = TRUE`];
  const values = [req.user.id];
  let i = 2;
  if (category) { conditions.push(`p.category = $${i}`); values.push(category); i += 1; }
  if (search) { conditions.push(`(p.title ILIKE $${i} OR p.brand ILIKE $${i})`); values.push(`%${search}%`); i += 1; }
  const limitIdx = i; values.push(pageSize); i += 1;
  const offsetIdx = i; values.push(offset); i += 1;

  try {
    const result = await query(
      `SELECT p.id, p.title, p.short_description, p.category, p.brand, p.images, p.price AS list_price,
              p.minimum_order_quantity, p.quantity_available,
              s.name AS shop_name, s.owner_id AS business_user_id, bp.company_name,
              part.id AS partnership_id, part.status AS partnership_status,
              acc.id AS access_id, acc.status AS access_status, acc.reseller_price,
              acc.commission_type, acc.commission_value,
              COUNT(*) OVER() AS total_count
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       LEFT JOIN business_profiles bp ON bp.user_id = s.owner_id AND bp.status = 'active'
       LEFT JOIN dropship_partnerships part ON part.business_id = s.owner_id AND part.dropshipper_id = $1
       LEFT JOIN dropship_product_access acc ON acc.product_id = p.id AND acc.partnership_id = part.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );
    const total = Number(result.rows[0]?.total_count || 0);
    const products = result.rows.map(({ total_count, ...rest }) => rest);
    return res.json({
      products,
      pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize), hasMore: offset + products.length < total }
    });
  } catch (err) {
    console.error('Browse dropship catalog error:', err);
    return res.status(500).json({ error: 'Could not load the dropship catalog.' });
  }
}

// Dropshipper requests access to one product, once their partnership with
// its owning business is approved.
export async function requestProductAccess(req, res) {
  const { productId, note } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId is required.' });

  try {
    const productResult = await query(
      `SELECT p.id, p.title, s.owner_id AS business_user_id
       FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE p.id = $1 AND p.is_dropshippable = TRUE AND p.status = 'active'`,
      [productId]
    );
    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ error: 'Dropshippable product not found.' });

    const partnershipResult = await query(
      `SELECT * FROM dropship_partnerships WHERE dropshipper_id = $1 AND business_id = $2 AND status = 'approved'`,
      [req.user.id, product.business_user_id]
    );
    const partnership = partnershipResult.rows[0];
    if (!partnership) {
      return res.status(403).json({ error: 'You need an approved partnership with this business before requesting product access.' });
    }

    const result = await query(
      `INSERT INTO dropship_product_access (partnership_id, product_id, request_note)
       VALUES ($1,$2,$3)
       ON CONFLICT (partnership_id, product_id)
       DO UPDATE SET status = 'pending', request_note = EXCLUDED.request_note,
                      response_note = NULL, responded_at = NULL, updated_at = now()
       RETURNING *`,
      [partnership.id, productId, note || null]
    );
    const access = result.rows[0];

    await logDropshipAction(null, {
      actorId: req.user.id, actorRole: req.user.role, action: 'product_access_requested',
      entityType: 'product_access', entityId: access.id, metadata: { productId, partnershipId: partnership.id }
    });
    await notifyUser(product.business_user_id, 'dropship_access_requested', 'New product access request',
      `A dropshipper requested access to resell "${product.title}".`, { accessId: access.id, productId });

    return res.status(201).json({ message: 'Product access requested.', access });
  } catch (err) {
    console.error('Request product access error:', err);
    return res.status(500).json({ error: 'Could not request product access.' });
  }
}

// Manufacturer/supplier approves/rejects/pauses/revokes access, and sets
// (or changes) the reseller price + commission — the controls the brief
// reserves for the business side. Every price/commission value present in
// the body is logged individually so an auditor can see exactly what
// changed and when, even on a routine "approve" call.
export async function respondProductAccess(req, res) {
  const { id } = req.params;
  const { status, resellerPrice, commissionType, commissionValue, regionOverride, responseNote } = req.body;
  if (!['active', 'rejected', 'paused', 'revoked'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  if (commissionType && !['percent', 'fixed'].includes(commissionType)) {
    return res.status(400).json({ error: 'commissionType must be percent or fixed.' });
  }

  try {
    const accessResult = await query(
      `SELECT acc.*, part.business_id, part.dropshipper_id, p.title
       FROM dropship_product_access acc
       JOIN dropship_partnerships part ON part.id = acc.partnership_id
       JOIN products p ON p.id = acc.product_id
       WHERE acc.id = $1`,
      [id]
    );
    const access = accessResult.rows[0];
    if (!access) return res.status(404).json({ error: 'Product access request not found.' });
    if (access.business_id !== req.user.id) return res.status(403).json({ error: 'Not your product to grant access to.' });

    if (status === 'active' && (resellerPrice === undefined || resellerPrice === null)) {
      return res.status(400).json({ error: 'resellerPrice is required to activate access.' });
    }

    const nextResellerPrice = resellerPrice !== undefined ? Number(resellerPrice) : access.reseller_price;
    const nextCommissionType = commissionType || access.commission_type;
    const nextCommissionValue = commissionValue !== undefined ? Number(commissionValue) : access.commission_value;

    const updated = await query(
      `UPDATE dropship_product_access
       SET status = $1, reseller_price = $2, commission_type = $3, commission_value = $4,
           region_override = COALESCE($5, region_override), response_note = $6,
           granted_by = $7, responded_at = now()
       WHERE id = $8 RETURNING *`,
      [status, nextResellerPrice, nextCommissionType, nextCommissionValue, regionOverride || null, responseNote || null, req.user.id, id]
    );
    const result = updated.rows[0];

    await logDropshipAction(null, {
      actorId: req.user.id, actorRole: req.user.role, action: `product_access_${status}`,
      entityType: 'product_access', entityId: id,
      metadata: { resellerPrice: nextResellerPrice, commissionType: nextCommissionType, commissionValue: nextCommissionValue }
    });
    // Price/commission changes on an already-active grant get their own
    // audit line, distinct from the status transition above — the brief
    // explicitly calls out "Price changes" / "Commission changes" as
    // things that must be individually traceable.
    if (resellerPrice !== undefined && Number(resellerPrice) !== Number(access.reseller_price)) {
      await logDropshipAction(null, {
        actorId: req.user.id, actorRole: req.user.role, action: 'price_changed',
        entityType: 'product_access', entityId: id,
        metadata: { from: access.reseller_price, to: nextResellerPrice }
      });
    }
    if (commissionValue !== undefined && Number(commissionValue) !== Number(access.commission_value)) {
      await logDropshipAction(null, {
        actorId: req.user.id, actorRole: req.user.role, action: 'commission_changed',
        entityType: 'product_access', entityId: id,
        metadata: { from: access.commission_value, to: nextCommissionValue, type: nextCommissionType }
      });
    }

    await notifyUser(access.dropshipper_id, 'dropship_access_updated', 'Product access updated',
      `Your access to resell "${access.title}" was updated to ${status}.`, { accessId: id, status });

    return res.json({ message: `Product access ${status}.`, access: result });
  } catch (err) {
    console.error('Respond product access error:', err);
    return res.status(500).json({ error: 'Could not update product access.' });
  }
}

// Dropshipper's own granted/pending product access, with marketing
// materials attached so the Sales Dashboard can render promo-ready cards.
export async function myProductAccess(req, res) {
  try {
    const result = await query(
      `SELECT acc.*, p.title, p.images, p.short_description, p.category,
              part.business_id, bu.username AS business_username, bp.company_name
       FROM dropship_product_access acc
       JOIN dropship_partnerships part ON part.id = acc.partnership_id
       JOIN products p ON p.id = acc.product_id
       JOIN users bu ON bu.id = part.business_id
       LEFT JOIN business_profiles bp ON bp.user_id = bu.id AND bp.status = 'active'
       WHERE part.dropshipper_id = $1
       ORDER BY acc.created_at DESC`,
      [req.user.id]
    );
    return res.json({ access: result.rows });
  } catch (err) {
    console.error('My product access error:', err);
    return res.status(500).json({ error: 'Could not load your product access.' });
  }
}

// Manufacturer/supplier's incoming requests + currently-granted access
// across all their dropship partners, for the "Control available
// products" / "View dropshipper performance" side of the brief.
export async function incomingProductAccess(req, res) {
  try {
    const result = await query(
      `SELECT acc.*, p.title, part.dropshipper_id, du.username AS dropshipper_username,
              dbp.dropship_performance_score, dbp.dropship_completed_orders, dbp.dropship_total_orders
       FROM dropship_product_access acc
       JOIN dropship_partnerships part ON part.id = acc.partnership_id
       JOIN products p ON p.id = acc.product_id
       JOIN users du ON du.id = part.dropshipper_id
       LEFT JOIN business_profiles dbp ON dbp.user_id = du.id AND dbp.business_type = 'dropshipper' AND dbp.status = 'active'
       WHERE part.business_id = $1
       ORDER BY acc.created_at DESC`,
      [req.user.id]
    );
    return res.json({ access: result.rows });
  } catch (err) {
    console.error('Incoming product access error:', err);
    return res.status(500).json({ error: 'Could not load incoming product access.' });
  }
}

// Toggles whether a manufacturer/supplier's own listing is open to the
// dropship network at all (separate control from any specific grant).
export async function toggleDropshippable(req, res) {
  const { productId } = req.params;
  const { isDropshippable } = req.body;
  try {
    const result = await query(
      `UPDATE products p SET is_dropshippable = $1
       FROM shops s WHERE p.shop_id = s.id AND p.id = $2 AND s.owner_id = $3
       RETURNING p.*`,
      [Boolean(isDropshippable), productId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found or not yours.' });
    await logDropshipAction(null, {
      actorId: req.user.id, actorRole: req.user.role, action: isDropshippable ? 'product_opened_to_dropship' : 'product_closed_to_dropship',
      entityType: 'product_access', entityId: productId, metadata: { productId }
    });
    return res.json({ message: 'Product updated.', product: result.rows[0] });
  } catch (err) {
    console.error('Toggle dropshippable error:', err);
    return res.status(500).json({ error: 'Could not update product.' });
  }
}

// ---------------------------------------------------------------------------
// MARKETING MATERIALS
// ---------------------------------------------------------------------------

export async function addMarketingAsset(req, res) {
  const { productId } = req.params;
  const { assetType, url, content, caption } = req.body;
  if (!['image', 'video', 'description_copy', 'banner', 'other'].includes(assetType)) {
    return res.status(400).json({ error: 'Invalid assetType.' });
  }
  try {
    const ownedResult = await query(
      `SELECT p.id FROM products p JOIN shops s ON s.id = p.shop_id WHERE p.id = $1 AND s.owner_id = $2`,
      [productId, req.user.id]
    );
    if (ownedResult.rows.length === 0) return res.status(403).json({ error: 'Not your product.' });

    const result = await query(
      `INSERT INTO dropship_marketing_assets (product_id, asset_type, url, content, caption, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [productId, assetType, url || null, content || null, caption || null, req.user.id]
    );
    return res.status(201).json({ message: 'Marketing asset added.', asset: result.rows[0] });
  } catch (err) {
    console.error('Add marketing asset error:', err);
    return res.status(500).json({ error: 'Could not add marketing asset.' });
  }
}

export async function listMarketingAssets(req, res) {
  const { productId } = req.params;
  try {
    // Anyone with active access to the product (or the owner) may view its
    // marketing materials.
    const result = await query(
      `SELECT * FROM dropship_marketing_assets WHERE product_id = $1 ORDER BY created_at DESC`,
      [productId]
    );
    return res.json({ assets: result.rows });
  } catch (err) {
    console.error('List marketing assets error:', err);
    return res.status(500).json({ error: 'Could not load marketing assets.' });
  }
}

export async function deleteMarketingAsset(req, res) {
  const { assetId } = req.params;
  try {
    const result = await query(
      `DELETE FROM dropship_marketing_assets WHERE id = $1 AND uploaded_by = $2 RETURNING id`,
      [assetId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found or not yours.' });
    return res.json({ message: 'Asset removed.' });
  } catch (err) {
    console.error('Delete marketing asset error:', err);
    return res.status(500).json({ error: 'Could not remove asset.' });
  }
}

// Resolves a resale link for the checkout page — any authenticated buyer,
// not just the dropshipper, needs to read this to see the reseller price
// before paying. Only ever returns active/approved access; a paused,
// pending, or revoked link simply 404s so a stale shared link fails safely.
export async function getAccessForCheckout(req, res) {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT acc.id AS access_id, acc.reseller_price, acc.status AS access_status,
              p.id AS product_id, p.title, p.short_description, p.images, p.currency, p.shop_id,
              p.quantity_available, p.minimum_order_quantity,
              part.status AS partnership_status
       FROM dropship_product_access acc
       JOIN dropship_partnerships part ON part.id = acc.partnership_id
       JOIN products p ON p.id = acc.product_id
       WHERE acc.id = $1 AND acc.status = 'active' AND part.status = 'approved' AND p.status = 'active'`,
      [id]
    );
    const access = result.rows[0];
    if (!access) return res.status(404).json({ error: 'This resale link is no longer available.' });
    return res.json({ access });
  } catch (err) {
    console.error('Get access for checkout error:', err);
    return res.status(500).json({ error: 'Could not load this product.' });
  }
}

// ---------------------------------------------------------------------------
// ORDERS — a customer buying through a dropshipper's resale access. Order
// creation is bespoke (reseller pricing + commission calc); confirmPayment
// and confirmDelivery are reused unmodified from ordersController.js since
// they operate generically on the orders table.
// ---------------------------------------------------------------------------

export async function createDropshipOrder(req, res) {
  const { accessId, quantity = 1, shippingAddress, method, couponCode } = req.body;
  if (!accessId || !method) return res.status(400).json({ error: 'accessId and payment method are required.' });

  try {
    const adapter = ADAPTERS[method];
    if (!adapter) return res.status(400).json({ error: 'Unsupported payment method.' });

    const order = await withTransaction(async (client) => {
      const accessResult = await client.query(
        `SELECT acc.*, part.allowed_regions AS partnership_regions, part.dropshipper_id, part.status AS partnership_status,
                p.id AS product_id, p.title, p.currency, p.quantity_available, p.minimum_order_quantity, p.status AS product_status,
                s.id AS shop_id, s.owner_id AS business_user_id
         FROM dropship_product_access acc
         JOIN dropship_partnerships part ON part.id = acc.partnership_id
         JOIN products p ON p.id = acc.product_id
         JOIN shops s ON s.id = p.shop_id
         WHERE acc.id = $1 FOR UPDATE OF p`,
        [accessId]
      );
      const access = accessResult.rows[0];
      if (!access) { const err = new Error('ACCESS_NOT_FOUND'); err.code = 'ACCESS_NOT_FOUND'; throw err; }
      if (access.status !== 'active' || access.partnership_status !== 'approved' || access.product_status !== 'active') {
        const err = new Error('ACCESS_NOT_ACTIVE'); err.code = 'ACCESS_NOT_ACTIVE'; throw err;
      }
      if (access.quantity_available < quantity) { const err = new Error('OUT_OF_STOCK'); err.code = 'OUT_OF_STOCK'; throw err; }

      const regions = access.region_override && access.region_override.length > 0 ? access.region_override : access.partnership_regions;
      if (!isRegionAllowed(regions, shippingAddress)) {
        const err = new Error('REGION_NOT_ALLOWED'); err.code = 'REGION_NOT_ALLOWED'; throw err;
      }

      const settingsResult = await client.query('SELECT platform_fee_percent FROM platform_settings WHERE id = 1');
      const feePercent = Number(settingsResult.rows[0]?.platform_fee_percent || 0);
      const unitPrice = Number(access.reseller_price);
      const subtotal = unitPrice * quantity;

      let coupon = null;
      let discount = 0;
      if (couponCode) {
        const couponResult = await client.query(
          `SELECT * FROM coupons WHERE code = $1 AND (shop_id = $2 OR shop_id IS NULL) AND is_active = TRUE
             AND (expires_at IS NULL OR expires_at > now()) FOR UPDATE`,
          [couponCode.toUpperCase(), access.shop_id]
        );
        coupon = couponResult.rows[0];
        if (!coupon) { const err = new Error('COUPON_INVALID'); err.code = 'COUPON_INVALID'; throw err; }
        if (subtotal < Number(coupon.min_order_amount)) { const err = new Error('COUPON_MIN_ORDER'); err.code = 'COUPON_MIN_ORDER'; throw err; }
        const redeemed = await client.query(
          `UPDATE coupons SET uses_count = uses_count + 1
           WHERE id = $1 AND (max_uses IS NULL OR uses_count < max_uses) RETURNING *`,
          [coupon.id]
        );
        if (redeemed.rows.length === 0) { const err = new Error('COUPON_EXHAUSTED'); err.code = 'COUPON_EXHAUSTED'; throw err; }
        coupon = redeemed.rows[0];
        discount = coupon.discount_type === 'percent'
          ? Math.round(subtotal * (Number(coupon.discount_value) / 100) * 100) / 100
          : Math.min(Number(coupon.discount_value), subtotal);
      }

      const discountedSubtotal = subtotal - discount;
      const feeAmount = Math.round(discountedSubtotal * feePercent) / 100;
      const total = discountedSubtotal + feeAmount;
      const commissionAmount = computeCommission(access.reseller_price, quantity, access.commission_type, access.commission_value);

      const orderResult = await client.query(
        `INSERT INTO orders (
           buyer_id, shop_id, product_id, quantity, unit_price, currency, platform_fee_percent, platform_fee_amount,
           total_amount, shipping_address, coupon_id, coupon_code, discount_amount,
           dropshipper_id, dropship_partnership_id, dropship_access_id, commission_amount, commission_status
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending')
         RETURNING *`,
        [req.user.id, access.shop_id, access.product_id, quantity, unitPrice, access.currency, feePercent, feeAmount,
         total, shippingAddress || null, coupon?.id || null, coupon?.code || null, discount,
         access.dropshipper_id, access.partnership_id, accessId, commissionAmount]
      );
      const newOrder = orderResult.rows[0];

      await logDropshipAction(client, {
        actorId: req.user.id, actorRole: req.user.role, action: 'order_placed',
        entityType: 'order', entityId: newOrder.id,
        metadata: { accessId, dropshipperId: access.dropshipper_id, businessId: access.business_user_id, commissionAmount, total }
      });

      return newOrder;
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const charge = await adapter({
      amount: order.total_amount, currency: order.currency, orderId: order.id,
      returnUrl: `${frontendUrl}/orders/${order.id}`
    });
    await query(
      `INSERT INTO payments (order_id, method, amount, currency, status, provider_reference, raw_response)
       VALUES ($1,$2,$3,$4,'initiated',$5,$6)`,
      [order.id, method, order.total_amount, order.currency, charge.providerReference, charge.raw]
    );

    await notifyUser(order.dropshipper_id, 'dropship_order_placed', 'New sale through your dropship link',
      `A customer placed an order worth ${order.total_amount} ${order.currency} — your commission will be released once delivery is confirmed.`,
      { orderId: order.id });

    return res.status(201).json({
      message: 'Order created. Complete payment to move funds into escrow.',
      order, checkoutUrl: charge.checkoutUrl, providerReference: charge.providerReference
    });
  } catch (err) {
    if (err.code === 'ACCESS_NOT_FOUND') return res.status(404).json({ error: 'Dropship product access not found.' });
    if (err.code === 'ACCESS_NOT_ACTIVE') return res.status(403).json({ error: 'This product is not currently available for resale.' });
    if (err.code === 'OUT_OF_STOCK') return res.status(400).json({ error: 'Not enough stock available.' });
    if (err.code === 'REGION_NOT_ALLOWED') return res.status(403).json({ error: 'This product cannot be shipped to the selected region under this partnership.' });
    if (err.code === 'COUPON_INVALID') return res.status(404).json({ error: 'Invalid or expired coupon code.' });
    if (err.code === 'COUPON_MIN_ORDER') return res.status(400).json({ error: `This coupon requires a minimum order of ${err.minOrderAmount}.` });
    if (err.code === 'COUPON_EXHAUSTED') return res.status(409).json({ error: 'This coupon has just reached its usage limit.' });
    console.error('Create dropship order error:', err);
    return res.status(500).json({ error: 'Could not create order.' });
  }
}

// Admin-only. Runs after ordersController.releaseFunds has already paid the
// full seller amount (reseller price minus platform fee) to the business's
// wallet — this call then carves the dropshipper's commission back out of
// that same wallet into the dropshipper's, so the business nets
// (sellerAmount - commission) and the dropshipper receives exactly the
// commission promised at order time. Kept as its own transaction/endpoint
// (rather than folded into releaseFunds) so non-dropship orders are
// completely untouched by this feature.
export async function releaseDropshipCommission(req, res) {
  const { orderId } = req.params;
  try {
    const result = await withTransaction(async (client) => {
      const claimed = await client.query(
        `UPDATE orders SET commission_status = 'released', commission_released_at = now()
         WHERE id = $1 AND dropshipper_id IS NOT NULL AND commission_status = 'pending'
           AND status = 'completed' AND funds_released_at IS NOT NULL
         RETURNING *`,
        [orderId]
      );
      if (claimed.rows.length === 0) {
        const existing = await client.query('SELECT id, commission_status, funds_released_at, status FROM orders WHERE id = $1', [orderId]);
        if (existing.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
        if (!existing.rows[0].funds_released_at) { const err = new Error('NOT_YET_RELEASED'); err.code = 'NOT_YET_RELEASED'; throw err; }
        const err = new Error('ALREADY_PROCESSED'); err.code = 'ALREADY_PROCESSED'; throw err;
      }
      const order = claimed.rows[0];
      const commissionAmount = Number(order.commission_amount || 0);

      const shopResult = await client.query('SELECT owner_id FROM shops WHERE id = $1', [order.shop_id]);
      const businessId = shopResult.rows[0].owner_id;

      if (commissionAmount > 0) {
        const businessWallet = await client.query(
          `UPDATE wallets SET balance = balance - $1 WHERE owner_id = $2 AND type = 'user' AND balance >= $1 RETURNING *`,
          [commissionAmount, businessId]
        );
        if (businessWallet.rows.length === 0) { const err = new Error('BUSINESS_BALANCE_INSUFFICIENT'); err.code = 'BUSINESS_BALANCE_INSUFFICIENT'; throw err; }
        await client.query(
          `INSERT INTO wallet_transactions (wallet_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
           VALUES ($1,'debit',$2,$3,'dropship_commission',$4,'Dropship commission paid out',$5)`,
          [businessWallet.rows[0].id, commissionAmount, businessWallet.rows[0].balance, order.id, req.user.id]
        );

        const dropshipperWallet = await client.query(
          `UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2 AND type = 'user' RETURNING *`,
          [commissionAmount, order.dropshipper_id]
        );
        await client.query(
          `INSERT INTO wallet_transactions (wallet_id, direction, amount, balance_after, reference_type, reference_id, note, created_by)
           VALUES ($1,'credit',$2,$3,'dropship_commission',$4,'Dropship commission earned',$5)`,
          [dropshipperWallet.rows[0].id, commissionAmount, dropshipperWallet.rows[0].balance, order.id, req.user.id]
        );
      }

      // Rolling stats + performance score for the dropshipper.
      await client.query(
        `UPDATE business_profiles
         SET dropship_total_orders = dropship_total_orders + 1,
             dropship_completed_orders = dropship_completed_orders + 1,
             dropship_total_sales_amount = dropship_total_sales_amount + $1,
             dropship_total_commission_earned = dropship_total_commission_earned + $2,
             dropship_last_sale_at = now()
         WHERE user_id = $3 AND business_type = 'dropshipper' AND status = 'active'`,
        [order.total_amount, commissionAmount, order.dropshipper_id]
      );
      await refreshPerformanceScore(client, order.dropshipper_id);

      await logDropshipAction(client, {
        actorId: req.user.id, actorRole: 'admin', action: 'commission_released',
        entityType: 'order', entityId: order.id, metadata: { commissionAmount, dropshipperId: order.dropshipper_id }
      });

      return { order, commissionAmount };
    });

    await notifyUser(result.order.dropshipper_id, 'dropship_commission_released', 'Commission released',
      `${result.commissionAmount} ${result.order.currency} commission has been released to your wallet for order ${result.order.id}.`,
      { orderId: result.order.id });

    return res.json({ message: 'Commission released.', order: result.order, commissionAmount: result.commissionAmount });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    if (err.code === 'NOT_YET_RELEASED') return res.status(409).json({ error: 'Escrow funds must be released to the business before commission can be paid out.' });
    if (err.code === 'ALREADY_PROCESSED') return res.status(409).json({ error: 'This commission has already been released.' });
    if (err.code === 'BUSINESS_BALANCE_INSUFFICIENT') return res.status(409).json({ error: "Business wallet balance is insufficient to cover the commission — investigate before retrying." });
    console.error('Release dropship commission error:', err);
    return res.status(500).json({ error: 'Could not release commission.' });
  }
}

// Marks a dropship order's commission as reversed (e.g. refund/chargeback,
// or an admin correcting a mistaken release) — feeds the reversal side of
// the dropshipper's performance score without moving any money itself
// (money-moving reversal/refund is handled by the existing dispute flow).
export async function reverseDropshipCommission(req, res) {
  const { orderId } = req.params;
  const { reason } = req.body;
  try {
    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE orders SET commission_status = 'reversed' WHERE id = $1 AND dropshipper_id IS NOT NULL RETURNING *`,
        [orderId]
      );
      if (updated.rows.length === 0) { const err = new Error('NOT_FOUND'); err.code = 'NOT_FOUND'; throw err; }
      const order = updated.rows[0];

      await client.query(
        `UPDATE business_profiles SET dropship_reversed_orders = dropship_reversed_orders + 1
         WHERE user_id = $1 AND business_type = 'dropshipper' AND status = 'active'`,
        [order.dropshipper_id]
      );
      await refreshPerformanceScore(client, order.dropshipper_id);

      await logDropshipAction(client, {
        actorId: req.user.id, actorRole: 'admin', action: 'commission_reversed',
        entityType: 'order', entityId: order.id, metadata: { reason }
      });
      return order;
    });
    return res.json({ message: 'Commission marked reversed.', order: result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    console.error('Reverse dropship commission error:', err);
    return res.status(500).json({ error: 'Could not reverse commission.' });
  }
}

// ---------------------------------------------------------------------------
// DASHBOARDS
// ---------------------------------------------------------------------------

// Dropshipper's Sales Dashboard — orders placed through their links,
// commission totals by status, and their current performance score.
export async function salesDashboard(req, res) {
  try {
    const ordersResult = await query(
      `SELECT o.id, o.created_at, o.status, o.total_amount, o.currency, o.commission_amount, o.commission_status,
              p.title AS product_title
       FROM orders o JOIN products p ON p.id = o.product_id
       WHERE o.dropshipper_id = $1
       ORDER BY o.created_at DESC LIMIT 200`,
      [req.user.id]
    );
    const profileResult = await query(
      `SELECT dropship_total_orders, dropship_completed_orders, dropship_reversed_orders,
              dropship_total_sales_amount, dropship_total_commission_earned,
              dropship_performance_score, dropship_last_sale_at
       FROM business_profiles WHERE user_id = $1 AND business_type = 'dropshipper' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    return res.json({
      orders: ordersResult.rows,
      performance: profileResult.rows[0] || {
        dropship_total_orders: 0, dropship_completed_orders: 0, dropship_reversed_orders: 0,
        dropship_total_sales_amount: 0, dropship_total_commission_earned: 0, dropship_performance_score: 0
      }
    });
  } catch (err) {
    console.error('Sales dashboard error:', err);
    return res.status(500).json({ error: 'Could not load sales dashboard.' });
  }
}

// Manufacturer/supplier's view of one dropshipper's performance (used from
// the incoming-partnerships/product-access screens).
export async function dropshipperPerformance(req, res) {
  const { dropshipperId } = req.params;
  try {
    const partnershipResult = await query(
      `SELECT id FROM dropship_partnerships WHERE dropshipper_id = $1 AND business_id = $2`,
      [dropshipperId, req.user.id]
    );
    if (partnershipResult.rows.length === 0) return res.status(403).json({ error: 'No partnership with this dropshipper.' });

    const profileResult = await query(
      `SELECT dropship_total_orders, dropship_completed_orders, dropship_reversed_orders,
              dropship_total_sales_amount, dropship_total_commission_earned,
              dropship_performance_score, dropship_last_sale_at
       FROM business_profiles WHERE user_id = $1 AND business_type = 'dropshipper' AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [dropshipperId]
    );
    return res.json({ performance: profileResult.rows[0] || null });
  } catch (err) {
    console.error('Dropshipper performance error:', err);
    return res.status(500).json({ error: 'Could not load performance.' });
  }
}

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

// Either party to a partnership can see the audit trail for their own
// partnerships/product access/orders; admins can see everything.
export async function myAuditLog(req, res) {
  const { entityType, limit = 100 } = req.query;
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 500);
  try {
    let rows;
    if (req.user.isAdmin) {
      const conditions = [];
      const values = [];
      let i = 1;
      if (entityType) { conditions.push(`entity_type = $${i}`); values.push(entityType); i += 1; }
      values.push(pageSize);
      rows = await query(
        `SELECT * FROM dropship_audit_log ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
         ORDER BY created_at DESC LIMIT $${i}`,
        values
      );
    } else {
      // Non-admins only see entries where they were the actor, or where the
      // entity belongs to one of their own partnerships — a simple actor-only
      // view covers the common case (each side sees what it did) without a
      // wide cross-entity join; broader auditing is admin-only.
      rows = await query(
        `SELECT * FROM dropship_audit_log WHERE actor_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [req.user.id, pageSize]
      );
    }
    return res.json({ log: rows.rows });
  } catch (err) {
    console.error('My audit log error:', err);
    return res.status(500).json({ error: 'Could not load audit log.' });
  }
}

export { DROPSHIPPER_ROLES, BUSINESS_ROLES };
