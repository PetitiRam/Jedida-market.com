import { query } from '../config/db.js';

// Roles allowed to browse a wholesale catalog and import from it. A supplier
// can source from a manufacturer, a seller/dropshipper can source from
// either — matches "Manufacturers should be able to supply sellers,
// suppliers, and dropshippers" in the expansion brief.
const SOURCING_ROLES = ['seller', 'supplier', 'dropshipper'];
// Roles that can *publish into* the wholesale catalog for others to source.
const CATALOG_OWNER_ROLES = ['manufacturer', 'supplier'];

async function getOwnedShop(userId) {
  const result = await query('SELECT id, name FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0] || null;
}

async function notifyUser(userId, type, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, type, title, body, JSON.stringify(metadata)]
  );
}

// Two businesses must have an accepted connection before sourcing requests
// or imports can happen between them, in either direction.
async function hasAcceptedConnection(userIdA, userIdB) {
  const result = await query(
    `SELECT id FROM business_connections
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND partner_id = $2) OR (requester_id = $2 AND partner_id = $1))`,
    [userIdA, userIdB]
  );
  return result.rows.length > 0;
}

// ============================================================
// CATALOG BROWSING
// ============================================================

// Public-to-the-platform (but auth-gated) wholesale catalog: every active,
// is_sourceable listing from a manufacturer/supplier shop, with the
// requester's connection status to that business attached so the frontend
// can show "Connect" vs "Request" vs "Import" appropriately.
export async function browseCatalog(req, res) {
  const { category, businessType, search, limit = 40, page = 1 } = req.query;
  const pageSize = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const offset = (pageNum - 1) * pageSize;

  const conditions = [`p.status = 'active'`, `p.is_sourceable = TRUE`];
  const values = [req.user.id];
  let i = 2;

  if (category) {
    conditions.push(`p.category = $${i}`);
    values.push(category);
    i += 1;
  }
  if (businessType && ['manufacturer', 'supplier'].includes(businessType)) {
    conditions.push(`u.primary_role = $${i}`);
    values.push(businessType);
    i += 1;
  }
  if (search) {
    conditions.push(`(p.title ILIKE $${i} OR p.brand ILIKE $${i})`);
    values.push(`%${search}%`);
    i += 1;
  }

  const limitIdx = i; values.push(pageSize); i += 1;
  const offsetIdx = i; values.push(offset); i += 1;

  try {
    const result = await query(
      `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.owner_id AS business_user_id,
              u.primary_role AS business_type, bp.company_name,
              conn.status AS connection_status, conn.id AS connection_id,
              COUNT(*) OVER() AS total_count
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN business_profiles bp ON bp.user_id = u.id AND bp.status = 'active'
       LEFT JOIN business_connections conn
         ON (conn.requester_id = $1 AND conn.partner_id = u.id)
         OR (conn.requester_id = u.id AND conn.partner_id = $1)
       WHERE ${conditions.join(' AND ')} AND s.owner_id <> $1
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
    console.error('Browse catalog error:', err);
    return res.status(500).json({ error: 'Could not load the sourcing catalog.' });
  }
}

// ============================================================
// BUSINESS CONNECTIONS
// ============================================================

export async function requestConnection(req, res) {
  const { partnerId, message } = req.body;
  if (!partnerId) return res.status(400).json({ error: 'partnerId is required.' });
  if (partnerId === req.user.id) return res.status(400).json({ error: 'You cannot connect with yourself.' });

  try {
    const partnerResult = await query('SELECT id, primary_role FROM users WHERE id = $1', [partnerId]);
    const partner = partnerResult.rows[0];
    if (!partner) return res.status(404).json({ error: 'Business not found.' });
    if (!['manufacturer', 'supplier', 'seller', 'dropshipper'].includes(partner.primary_role)) {
      return res.status(400).json({ error: 'That account cannot be connected with.' });
    }

    const result = await query(
      `INSERT INTO business_connections (requester_id, partner_id, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (requester_id, partner_id)
       DO UPDATE SET status = 'pending', message = EXCLUDED.message, response_note = NULL, responded_at = NULL, updated_at = now()
       RETURNING *`,
      [req.user.id, partnerId, message || null]
    );

    await notifyUser(partnerId, 'connection_requested', 'New connection request',
      'A business has requested to connect with you on the sourcing network.',
      { connectionId: result.rows[0].id });

    return res.status(201).json({ message: 'Connection request sent.', connection: result.rows[0] });
  } catch (err) {
    console.error('Request connection error:', err);
    return res.status(500).json({ error: 'Could not send connection request.' });
  }
}

export async function myConnections(req, res) {
  try {
    const result = await query(
      `SELECT c.*,
              ru.username AS requester_username, ru.primary_role AS requester_role,
              pu.username AS partner_username, pu.primary_role AS partner_role
       FROM business_connections c
       JOIN users ru ON ru.id = c.requester_id
       JOIN users pu ON pu.id = c.partner_id
       WHERE c.requester_id = $1 OR c.partner_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    return res.json({ connections: result.rows });
  } catch (err) {
    console.error('My connections error:', err);
    return res.status(500).json({ error: 'Could not load connections.' });
  }
}

export async function respondConnection(req, res) {
  const { id } = req.params;
  const { status, responseNote } = req.body;
  if (!['accepted', 'declined', 'revoked'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    // Either side may revoke an accepted connection; only the recipient
    // (partner_id) can accept/decline a pending request.
    const whoCanSet = status === 'revoked'
      ? `(requester_id = $3 OR partner_id = $3)`
      : `partner_id = $3`;

    const result = await query(
      `UPDATE business_connections
       SET status = $1, response_note = $2, responded_at = now()
       WHERE id = $4 AND ${whoCanSet}
       RETURNING *`,
      [status, responseNote || null, req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Connection not found or not yours to update.' });

    const connection = result.rows[0];
    const otherParty = connection.requester_id === req.user.id ? connection.partner_id : connection.requester_id;
    await notifyUser(otherParty, 'connection_updated', 'Connection request updated',
      `Your connection request was ${status}.`, { connectionId: connection.id, status });

    return res.json({ message: `Connection ${status}.`, connection });
  } catch (err) {
    console.error('Respond connection error:', err);
    return res.status(500).json({ error: 'Could not update connection.' });
  }
}

// ============================================================
// PRODUCT SOURCING REQUESTS
// ============================================================

export async function createSourcingRequest(req, res) {
  const { targetBusinessId, sourceProductId, description, quantityRequested } = req.body;
  if (!targetBusinessId) return res.status(400).json({ error: 'targetBusinessId is required.' });

  try {
    const connected = await hasAcceptedConnection(req.user.id, targetBusinessId);
    if (!connected) {
      return res.status(403).json({ error: 'You must have an accepted connection with this business before requesting products.' });
    }

    const result = await query(
      `INSERT INTO product_sourcing_requests
         (requester_id, target_business_id, source_product_id, description, quantity_requested)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, targetBusinessId, sourceProductId || null, description || null, Number(quantityRequested) || 1]
    );

    await notifyUser(targetBusinessId, 'sourcing_request_received', 'New sourcing request',
      'A business has requested to source a product from your catalog.',
      { requestId: result.rows[0].id });

    return res.status(201).json({ message: 'Sourcing request sent.', request: result.rows[0] });
  } catch (err) {
    console.error('Create sourcing request error:', err);
    return res.status(500).json({ error: 'Could not send sourcing request.' });
  }
}

export async function mySourcingRequests(req, res) {
  try {
    const result = await query(
      `SELECT r.*, p.title AS source_product_title,
              ru.username AS requester_username, tb.username AS target_username
       FROM product_sourcing_requests r
       LEFT JOIN products p ON p.id = r.source_product_id
       JOIN users ru ON ru.id = r.requester_id
       JOIN users tb ON tb.id = r.target_business_id
       WHERE r.requester_id = $1 OR r.target_business_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error('My sourcing requests error:', err);
    return res.status(500).json({ error: 'Could not load sourcing requests.' });
  }
}

export async function respondSourcingRequest(req, res) {
  const { id } = req.params;
  const { status, responseNote } = req.body;
  if (!['accepted', 'declined', 'fulfilled', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    // The target business responds to accept/decline/fulfill; the original
    // requester may still cancel their own pending request.
    const whoCanSet = status === 'cancelled' ? `requester_id = $4` : `target_business_id = $4`;
    const result = await query(
      `UPDATE product_sourcing_requests
       SET status = $1, response_note = $2, responded_at = now()
       WHERE id = $3 AND ${whoCanSet}
       RETURNING *`,
      [status, responseNote || null, id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sourcing request not found or not yours to update.' });

    const request = result.rows[0];
    const otherParty = request.target_business_id === req.user.id ? request.requester_id : request.target_business_id;
    await notifyUser(otherParty, 'sourcing_request_updated', 'Sourcing request updated',
      `Your sourcing request was ${status}.`, { requestId: request.id, status });

    return res.json({ message: `Sourcing request ${status}.`, request });
  } catch (err) {
    console.error('Respond sourcing request error:', err);
    return res.status(500).json({ error: 'Could not update sourcing request.' });
  }
}

// ============================================================
// PRODUCT IMPORT
// ============================================================

function computeImportedPrice(sourceProduct, marginType, marginValue) {
  const base = Number(sourceProduct.wholesale_price ?? sourceProduct.price);
  const margin = Number(marginValue) || 0;
  const price = marginType === 'fixed' ? base + margin : base * (1 + margin / 100);
  return Math.max(Math.round(price * 100) / 100, 0);
}

// Copies a manufacturer/supplier's sourceable listing into the importer's
// own shop as a brand-new `products` row (so it flows through every
// existing storefront/browse/order path unmodified), linked back to the
// source via product_imports for markup + sync tracking.
export async function importProduct(req, res) {
  const { sourceProductId, marginType = 'percent', marginValue = 0 } = req.body;
  if (!sourceProductId) return res.status(400).json({ error: 'sourceProductId is required.' });
  if (!['percent', 'fixed'].includes(marginType)) return res.status(400).json({ error: 'marginType must be percent or fixed.' });

  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(403).json({ error: 'Open your shop before importing products.' });

    const sourceResult = await query(
      `SELECT p.*, s.owner_id AS business_user_id
       FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE p.id = $1 AND p.is_sourceable = TRUE AND p.status = 'active'`,
      [sourceProductId]
    );
    const source = sourceResult.rows[0];
    if (!source) return res.status(404).json({ error: 'Sourceable product not found.' });

    const connected = await hasAcceptedConnection(req.user.id, source.business_user_id);
    if (!connected) {
      return res.status(403).json({ error: 'You must have an accepted connection with this business before importing its products.' });
    }

    const importedPrice = computeImportedPrice(source, marginType, marginValue);

    const newProduct = await query(
      `INSERT INTO products (
         shop_id, title, short_description, description, category, condition,
         brand, manufacturer, model_number, sku,
         price, original_price, currency,
         quantity_available, minimum_order_quantity,
         images, specs, location_city, location_country, shipping_options,
         status
       )
       SELECT $1, title, short_description, description, category, condition,
              brand, manufacturer, model_number, sku,
              $2, price, currency,
              quantity_available, minimum_order_quantity,
              images, specs, location_city, location_country, shipping_options,
              'pending_review'
       FROM products WHERE id = $3
       RETURNING *`,
      [shop.id, importedPrice, sourceProductId]
    );

    const importRow = await query(
      `INSERT INTO product_imports
         (importer_id, importer_shop_id, source_product_id, imported_product_id, margin_type, margin_value, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       RETURNING *`,
      [req.user.id, shop.id, sourceProductId, newProduct.rows[0].id, marginType, Number(marginValue) || 0]
    );

    await notifyUser(source.business_user_id, 'product_imported', 'Product imported',
      `${shop.name} imported "${source.title}" into their storefront.`,
      { importId: importRow.rows[0].id, sourceProductId });

    return res.status(201).json({
      message: 'Product imported. It will go live once approved by the admin.',
      product: newProduct.rows[0],
      import: importRow.rows[0]
    });
  } catch (err) {
    console.error('Import product error:', err);
    return res.status(500).json({ error: 'Could not import this product.' });
  }
}

export async function bulkImportProducts(req, res) {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array.' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Import up to 50 products at a time.' });
  }

  const results = [];
  for (const item of items) {
    // Reuses importProduct's logic per item via a lightweight fake
    // req/res pair so error handling/notifications stay in one place.
    await new Promise((resolve) => {
      importProduct(
        { user: req.user, body: item },
        {
          status(code) { this._code = code; return this; },
          json(payload) { results.push({ sourceProductId: item.sourceProductId, ok: (this._code || 200) < 400, ...payload }); resolve(); }
        }
      );
    });
  }

  const succeeded = results.filter((r) => r.ok).length;
  return res.status(200).json({ message: `${succeeded}/${items.length} products imported.`, results });
}

export async function myImports(req, res) {
  try {
    const result = await query(
      `SELECT pi.*, sp.title AS source_title, sp.price AS source_price,
              ip.title AS imported_title, ip.price AS imported_price, ip.status AS imported_status
       FROM product_imports pi
       JOIN products sp ON sp.id = pi.source_product_id
       JOIN products ip ON ip.id = pi.imported_product_id
       WHERE pi.importer_id = $1
       ORDER BY pi.created_at DESC`,
      [req.user.id]
    );
    return res.json({ imports: result.rows });
  } catch (err) {
    console.error('My imports error:', err);
    return res.status(500).json({ error: 'Could not load your imports.' });
  }
}

export async function updateImport(req, res) {
  const { id } = req.params;
  const { marginType, marginValue, syncEnabled, status, resync } = req.body;

  try {
    const importResult = await query(
      `SELECT * FROM product_imports WHERE id = $1 AND importer_id = $2`,
      [id, req.user.id]
    );
    const importRow = importResult.rows[0];
    if (!importRow) return res.status(404).json({ error: 'Import not found.' });

    const nextMarginType = marginType && ['percent', 'fixed'].includes(marginType) ? marginType : importRow.margin_type;
    const nextMarginValue = marginValue !== undefined ? Number(marginValue) : importRow.margin_value;
    const nextSyncEnabled = syncEnabled !== undefined ? Boolean(syncEnabled) : importRow.sync_enabled;
    const nextStatus = status && ['active', 'paused', 'removed'].includes(status) ? status : importRow.status;

    const updated = await query(
      `UPDATE product_imports
       SET margin_type = $1, margin_value = $2, sync_enabled = $3, status = $4, updated_at = now()
       WHERE id = $5 RETURNING *`,
      [nextMarginType, nextMarginValue, nextSyncEnabled, nextStatus, id]
    );

    // Re-price the importer's listing off the current source price/stock
    // right now, in addition to whatever sync_enabled schedules later.
    if (resync || marginType || marginValue !== undefined) {
      const sourceResult = await query('SELECT * FROM products WHERE id = $1', [importRow.source_product_id]);
      const source = sourceResult.rows[0];
      if (source) {
        const newPrice = computeImportedPrice(source, nextMarginType, nextMarginValue);
        await query(
          `UPDATE products SET price = $1, quantity_available = $2 WHERE id = $3`,
          [newPrice, source.quantity_available, importRow.imported_product_id]
        );
        await query(`UPDATE product_imports SET last_synced_at = now() WHERE id = $1`, [id]);
      }
    }

    return res.json({ message: 'Import updated.', import: updated.rows[0] });
  } catch (err) {
    console.error('Update import error:', err);
    return res.status(500).json({ error: 'Could not update import.' });
  }
}

export async function removeImport(req, res) {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE product_imports SET status = 'removed', sync_enabled = FALSE, updated_at = now()
       WHERE id = $1 AND importer_id = $2 RETURNING *`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Import not found.' });
    // Pull the storefront listing down too — the source relationship is
    // gone, but the seller keeps full ownership of (and can re-publish) it.
    await query(`UPDATE products SET status = 'paused' WHERE id = $1`, [result.rows[0].imported_product_id]);
    return res.json({ message: 'Import removed. The listing was paused in your shop.', import: result.rows[0] });
  } catch (err) {
    console.error('Remove import error:', err);
    return res.status(500).json({ error: 'Could not remove import.' });
  }
}

export { SOURCING_ROLES, CATALOG_OWNER_ROLES };
