import { query } from '../config/db.js';

// Manufacturer, Supplier, and Farmer share this whole module — same bulk-only
// storefront foundation (schema_phase37 gave manufacturer/supplier the shop;
// schema_phase45 adds farmer on the same foundation). Dropshipper is
// deliberately excluded: it resells other businesses' listings (see
// phase38 imports) rather than running its own factory/warehouse/farm.
export const B2B_ROLES = ['manufacturer', 'supplier', 'farmer'];

async function getOwnShop(userId) {
  const result = await query('SELECT * FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0] || null;
}

async function getOwnBusinessProfile(userId) {
  const result = await query(
    `SELECT bp.* FROM business_profiles bp
     JOIN role_upgrades ru ON ru.id = bp.upgrade_id
     WHERE bp.user_id = $1 ORDER BY bp.created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// Confirms the calling user owns the product before letting them touch its
// tiers/certificates — same ownership check pattern productsController uses.
async function assertOwnsProduct(userId, productId) {
  const result = await query(
    `SELECT p.* FROM products p JOIN shops s ON s.id = p.shop_id WHERE p.id = $1 AND s.owner_id = $2`,
    [productId, userId]
  );
  return result.rows[0] || null;
}

// ---------- Business (factory/warehouse) profile ----------

export async function getMyBusinessProfile(req, res) {
  try {
    const profile = await getOwnBusinessProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'No business profile found. Complete your upgrade first.' });
    return res.json({ profile });
  } catch (err) {
    console.error('Get my business profile error:', err);
    return res.status(500).json({ error: 'Could not load business profile.' });
  }
}

export async function updateMyBusinessProfile(req, res) {
  const { factoryAddress, warehouseAddress, productionCapacity, stockAvailability } = req.body;
  const VALID_STOCK = ['in_stock', 'limited_stock', 'made_to_order', 'out_of_stock'];
  if (stockAvailability && !VALID_STOCK.includes(stockAvailability)) {
    return res.status(400).json({ error: 'Invalid stock availability value.' });
  }

  try {
    const profile = await getOwnBusinessProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'No business profile found. Complete your upgrade first.' });

    const result = await query(
      `UPDATE business_profiles SET
         factory_address = COALESCE($1, factory_address),
         warehouse_address = COALESCE($2, warehouse_address),
         production_capacity = COALESCE($3, production_capacity),
         stock_availability = COALESCE($4, stock_availability)
       WHERE id = $5 RETURNING *`,
      [factoryAddress ?? null, warehouseAddress ?? null, productionCapacity ?? null, stockAvailability ?? null, profile.id]
    );
    return res.json({ message: 'Business profile updated.', profile: result.rows[0] });
  } catch (err) {
    console.error('Update my business profile error:', err);
    return res.status(500).json({ error: 'Could not update business profile.' });
  }
}

// ---------- Wholesale pricing tiers ----------

export async function listTiers(req, res) {
  try {
    const result = await query(
      `SELECT * FROM product_wholesale_tiers WHERE product_id = $1 ORDER BY min_quantity ASC`,
      [req.params.productId]
    );
    return res.json({ tiers: result.rows });
  } catch (err) {
    console.error('List wholesale tiers error:', err);
    return res.status(500).json({ error: 'Could not load pricing tiers.' });
  }
}

// Replaces the full tier set for a product in one call — simplest mental
// model for a small editable table in the dashboard (add/edit/remove rows,
// save once) rather than juggling per-row create/update/delete endpoints.
export async function replaceTiers(req, res) {
  const { productId } = req.params;
  const { tiers } = req.body;
  if (!Array.isArray(tiers)) return res.status(400).json({ error: 'tiers must be an array.' });

  try {
    const product = await assertOwnsProduct(req.user.id, productId);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    for (const t of tiers) {
      if (!Number.isInteger(t.minQuantity) || t.minQuantity <= 0) {
        return res.status(400).json({ error: 'Each tier needs a whole-number minQuantity greater than 0.' });
      }
      if (t.maxQuantity != null && Number(t.maxQuantity) < t.minQuantity) {
        return res.status(400).json({ error: 'maxQuantity cannot be less than minQuantity.' });
      }
      if (t.unitPrice == null || Number(t.unitPrice) < 0) {
        return res.status(400).json({ error: 'Each tier needs a non-negative unitPrice.' });
      }
    }

    await query('DELETE FROM product_wholesale_tiers WHERE product_id = $1', [productId]);
    const inserted = [];
    for (const t of tiers) {
      const result = await query(
        `INSERT INTO product_wholesale_tiers (product_id, min_quantity, max_quantity, unit_price)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [productId, t.minQuantity, t.maxQuantity ?? null, t.unitPrice]
      );
      inserted.push(result.rows[0]);
    }
    return res.json({ message: 'Pricing tiers saved.', tiers: inserted });
  } catch (err) {
    console.error('Replace wholesale tiers error:', err);
    return res.status(500).json({ error: 'Could not save pricing tiers.' });
  }
}

// ---------- Certificates ----------

export async function listCertificates(req, res) {
  try {
    const result = await query(
      `SELECT * FROM product_certificates WHERE product_id = $1 ORDER BY created_at DESC`,
      [req.params.productId]
    );
    return res.json({ certificates: result.rows });
  } catch (err) {
    console.error('List certificates error:', err);
    return res.status(500).json({ error: 'Could not load certificates.' });
  }
}

export async function addCertificate(req, res) {
  const { productId } = req.params;
  const { name, issuingBody, fileUrl, issuedAt } = req.body;
  if (!name || !fileUrl) return res.status(400).json({ error: 'Certificate name and file are required.' });

  try {
    const product = await assertOwnsProduct(req.user.id, productId);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const result = await query(
      `INSERT INTO product_certificates (product_id, name, issuing_body, file_url, issued_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [productId, name, issuingBody || null, fileUrl, issuedAt || null]
    );
    return res.status(201).json({ message: 'Certificate added.', certificate: result.rows[0] });
  } catch (err) {
    console.error('Add certificate error:', err);
    return res.status(500).json({ error: 'Could not add certificate.' });
  }
}

export async function deleteCertificate(req, res) {
  try {
    const result = await query(
      `DELETE FROM product_certificates pc USING products p, shops s
       WHERE pc.id = $1 AND pc.product_id = p.id AND p.shop_id = s.id AND s.owner_id = $2
       RETURNING pc.id`,
      [req.params.certificateId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Certificate not found.' });
    return res.json({ message: 'Certificate removed.' });
  } catch (err) {
    console.error('Delete certificate error:', err);
    return res.status(500).json({ error: 'Could not remove certificate.' });
  }
}

// ---------- Analytics ----------

export async function getBusinessAnalytics(req, res) {
  try {
    const shop = await getOwnShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    const [orderStats, topProducts, quoteStats, catalogStats] = await Promise.all([
      query(
        `SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0) AS revenue,
                COALESCE(AVG(quantity), 0) AS avg_quantity
         FROM orders WHERE shop_id = $1 AND status IN ('paid_escrow', 'shipped', 'delivered_confirmed', 'completed')`,
        [shop.id]
      ),
      query(
        `SELECT id, title, orders_count, quantity_available, minimum_order_quantity
         FROM products WHERE shop_id = $1 ORDER BY orders_count DESC LIMIT 5`,
        [shop.id]
      ),
      query(
        `SELECT status, COUNT(*) AS count FROM quote_requests WHERE business_id = $1 GROUP BY status`,
        [req.user.id]
      ),
      query(
        `SELECT COUNT(*) AS total_listings,
                COUNT(*) FILTER (WHERE status = 'active') AS active_listings,
                COALESCE(SUM(quantity_available), 0) AS total_units_available
         FROM products WHERE shop_id = $1`,
        [shop.id]
      )
    ]);

    const quoteCounts = quoteStats.rows.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {});
    const totalQuotes = Object.values(quoteCounts).reduce((a, b) => a + b, 0);
    const acceptedQuotes = quoteCounts.accepted || 0;

    return res.json({
      orders: {
        count: Number(orderStats.rows[0].order_count),
        revenue: Number(orderStats.rows[0].revenue),
        avgOrderQuantity: Number(orderStats.rows[0].avg_quantity)
      },
      topProducts: topProducts.rows,
      quotes: {
        byStatus: quoteCounts,
        total: totalQuotes,
        conversionRate: totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 1000) / 10 : 0
      },
      catalog: {
        totalListings: Number(catalogStats.rows[0].total_listings),
        activeListings: Number(catalogStats.rows[0].active_listings),
        totalUnitsAvailable: Number(catalogStats.rows[0].total_units_available)
      }
    });
  } catch (err) {
    console.error('Get business analytics error:', err);
    return res.status(500).json({ error: 'Could not load analytics.' });
  }
}
