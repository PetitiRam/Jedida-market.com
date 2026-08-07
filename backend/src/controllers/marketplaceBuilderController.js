// Marketplace Builder — the visual CMS behind the Jedida-Market homepage.
// Every section is a row in marketplace_sections; a section either points
// at one of the platform's live queries (source_type='query', the same
// SQL homeController.js already runs), auto-pulls a category's current
// top products (source_type='category'), or holds an explicit,
// admin/AI-curated list of products/shops/categories (source_type='manual').
// Nothing here is hardcoded — resolveSection() always re-runs the live
// query or reads the current attachment rows at request time.
import { query, withTransaction } from '../config/db.js';

const PRODUCT_FIELDS = `p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status`;

// ---------------------------------------------------------------------------
// Live query resolvers — mirrors homeController.js exactly for the seeded
// system sections, so reordering/hiding them in the builder never changes
// what data feeds them.
// ---------------------------------------------------------------------------
const QUERY_RESOLVERS = {
  featured: (limit) => query(
    `SELECT ${PRODUCT_FIELDS} FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'active' AND p.is_featured = TRUE ORDER BY p.created_at DESC LIMIT $1`, [limit]),
  trending: (limit) => query(
    `SELECT ${PRODUCT_FIELDS} FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'active' AND p.is_trending = TRUE ORDER BY p.views_count DESC LIMIT $1`, [limit]),
  new: (limit) => query(
    `SELECT ${PRODUCT_FIELDS} FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'active' ORDER BY p.created_at DESC LIMIT $1`, [limit]),
  deals: (limit) => query(
    `SELECT ${PRODUCT_FIELDS} FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'active' AND p.original_price > p.price
     ORDER BY (p.original_price - p.price) DESC LIMIT $1`, [limit]),
  recommended: (limit) => query(
    `SELECT ${PRODUCT_FIELDS} FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'active' ORDER BY p.orders_count DESC, p.views_count DESC LIMIT $1`, [limit]),
  // 'nearby' needs the visitor's coordinates, which the builder/admin
  // preview doesn't have — resolved as "newest" here so the admin still
  // sees real rows; the live homepage keeps using homeController's
  // coordinate-aware version for the actual buyer-facing "Near You" rail.
  nearby: (limit) => query(
    `SELECT ${PRODUCT_FIELDS} FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'active' ORDER BY p.created_at DESC LIMIT $1`, [limit]),
  shops_featured: (limit) => query(
    `SELECT s.id, s.name, s.slug, s.logo_url, s.banner_url, s.primary_category, s.status,
            COALESCE(AVG(r.rating), 0) AS rating, COUNT(DISTINCT p.id) AS product_count
     FROM shops s
     JOIN products p ON p.shop_id = s.id AND p.status = 'active'
     LEFT JOIN product_reviews r ON r.product_id = p.id
     WHERE s.status = 'active' GROUP BY s.id ORDER BY rating DESC LIMIT $1`, [limit]),
};

async function resolveSection(section) {
  const limit = section.max_items || 12;
  let items = [];

  if (section.section_kind === 'categories') {
    const rows = await query(
      `SELECT sc.category, sc.position,
              (SELECT COUNT(*) FROM products WHERE status = 'active' AND category = sc.category) AS count,
              (SELECT images[1] FROM products WHERE status = 'active' AND category = sc.category
                 AND array_length(images, 1) > 0 ORDER BY is_featured DESC, orders_count DESC LIMIT 1) AS image_url
       FROM marketplace_section_categories sc WHERE sc.section_id = $1 ORDER BY sc.position ASC`,
      [section.id]
    );
    items = rows.rows.map((r) => ({ category: r.category, count: Number(r.count), image_url: r.image_url }));
  } else if (section.source_type === 'query' && QUERY_RESOLVERS[section.query_type]) {
    const rows = await QUERY_RESOLVERS[section.query_type](limit);
    items = rows.rows;
  } else if (section.source_type === 'category' && section.filter_category) {
    const table = section.section_kind === 'shops' ? null : 'products';
    if (table) {
      const rows = await query(
        `SELECT ${PRODUCT_FIELDS} FROM products p JOIN shops s ON s.id = p.shop_id
         WHERE p.status = 'active' AND p.category = $1
         ORDER BY p.is_featured DESC, p.orders_count DESC, p.created_at DESC LIMIT $2`,
        [section.filter_category, limit]
      );
      items = rows.rows;
    }
  } else if (section.section_kind === 'shops') {
    const rows = await query(
      `SELECT s.id, s.name, s.slug, s.logo_url, s.banner_url, s.primary_category, s.status
       FROM marketplace_section_shops msp JOIN shops s ON s.id = msp.shop_id
       WHERE msp.section_id = $1 AND s.status = 'active' ORDER BY msp.position ASC LIMIT $2`,
      [section.id, limit]
    );
    items = rows.rows;
  } else {
    const rows = await query(
      `SELECT ${PRODUCT_FIELDS}, msp.added_by FROM marketplace_section_products msp
       JOIN products p ON p.id = msp.product_id JOIN shops s ON s.id = p.shop_id
       WHERE msp.section_id = $1 AND p.status = 'active' ORDER BY msp.position ASC LIMIT $2`,
      [section.id, limit]
    );
    items = rows.rows;
  }
  return items;
}

function isLive(section) {
  const now = new Date();
  if (section.starts_at && new Date(section.starts_at) > now) return false;
  if (section.ends_at && new Date(section.ends_at) < now) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Public — the resolved, ordered, currently-live layout for the homepage
// and for "View all" pages of custom sections.
// ---------------------------------------------------------------------------
export async function getPublicLayout(req, res) {
  try {
    const { rows } = await query(`SELECT * FROM marketplace_sections ORDER BY position ASC`);
    const live = rows.filter((s) => s.is_enabled && isLive(s));
    const sections = await Promise.all(live.map(async (s) => ({
      key: s.section_key,
      title: s.title,
      subtitle: s.subtitle,
      kind: s.section_kind,
      layout: s.layout,
      items: await resolveSection(s),
    })));
    res.json({ sections });
  } catch (err) {
    console.error('Marketplace layout error:', err);
    res.status(500).json({ error: 'Could not load the marketplace layout.' });
  }
}

export async function getPublicSection(req, res) {
  try {
    const { rows } = await query(`SELECT * FROM marketplace_sections WHERE section_key = $1`, [req.params.key]);
    const section = rows[0];
    if (!section || !section.is_enabled || !isLive(section)) return res.status(404).json({ error: 'Section not found.' });
    const items = await resolveSection({ ...section, max_items: Number(req.query.limit) || section.max_items });
    res.json({ title: section.title, subtitle: section.subtitle, kind: section.section_kind, items });
  } catch (err) {
    console.error('Marketplace section error:', err);
    res.status(500).json({ error: 'Could not load this section.' });
  }
}

// ---------------------------------------------------------------------------
// Admin — full CRUD + drag-and-drop reorder + attachments.
// ---------------------------------------------------------------------------
export async function adminListSections(req, res) {
  try {
    const { rows } = await query(
      `SELECT ms.*,
         (SELECT COUNT(*) FROM marketplace_section_products WHERE section_id = ms.id) AS product_count,
         (SELECT COUNT(*) FROM marketplace_section_shops WHERE section_id = ms.id) AS shop_count,
         (SELECT COUNT(*) FROM marketplace_section_categories WHERE section_id = ms.id) AS category_count
       FROM marketplace_sections ms ORDER BY ms.position ASC`
    );
    res.json({ sections: rows });
  } catch (err) {
    console.error('Admin list sections error:', err);
    res.status(500).json({ error: 'Could not load sections.' });
  }
}

export async function adminGetSection(req, res) {
  try {
    const { rows } = await query(`SELECT * FROM marketplace_sections WHERE id = $1`, [req.params.id]);
    const section = rows[0];
    if (!section) return res.status(404).json({ error: 'Section not found.' });

    let products = [], shops = [], categories = [];
    if (section.section_kind === 'products') {
      const r = await query(
        `SELECT msp.position, msp.added_by, p.id, p.title, p.price, p.currency, p.images, p.category, p.status
         FROM marketplace_section_products msp JOIN products p ON p.id = msp.product_id
         WHERE msp.section_id = $1 ORDER BY msp.position ASC`, [section.id]);
      products = r.rows;
    } else if (section.section_kind === 'shops') {
      const r = await query(
        `SELECT mss.position, mss.added_by, s.id, s.name, s.slug, s.logo_url, s.status
         FROM marketplace_section_shops mss JOIN shops s ON s.id = mss.shop_id
         WHERE mss.section_id = $1 ORDER BY mss.position ASC`, [section.id]);
      shops = r.rows;
    } else if (section.section_kind === 'categories') {
      const r = await query(
        `SELECT category, position FROM marketplace_section_categories WHERE section_id = $1 ORDER BY position ASC`,
        [section.id]);
      categories = r.rows;
    }
    res.json({ section, products, shops, categories });
  } catch (err) {
    console.error('Admin get section error:', err);
    res.status(500).json({ error: 'Could not load section.' });
  }
}

export async function adminCreateSection(req, res) {
  try {
    const { title, subtitle, sectionKind, sourceType, queryType, filterCategory, layout, maxItems, aiManaged } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });

    const sectionKey = `custom_${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50)}_${Date.now().toString(36)}`;
    const { rows: posRows } = await query(`SELECT COALESCE(MAX(position), 0) + 10 AS next FROM marketplace_sections`);

    const { rows } = await query(
      `INSERT INTO marketplace_sections
         (section_key, title, subtitle, section_kind, source_type, query_type, filter_category, layout, position, max_items, ai_managed, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
      [
        sectionKey, title.trim(), subtitle || null,
        sectionKind || 'products', sourceType || 'manual', queryType || null, filterCategory || null,
        layout || 'rail', posRows[0].next, maxItems || 12, Boolean(aiManaged), req.user.id
      ]
    );
    res.status(201).json({ section: rows[0] });
  } catch (err) {
    console.error('Admin create section error:', err);
    res.status(500).json({ error: 'Could not create section.' });
  }
}

export async function adminUpdateSection(req, res) {
  try {
    const { id } = req.params;
    const { title, subtitle, layout, maxItems, aiManaged, filterCategory, startsAt, endsAt } = req.body;
    const { rows: existingRows } = await query(`SELECT * FROM marketplace_sections WHERE id = $1`, [id]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Section not found.' });

    const { rows } = await query(
      `UPDATE marketplace_sections SET
         title = COALESCE($1, title),
         subtitle = COALESCE($2, subtitle),
         layout = COALESCE($3, layout),
         max_items = COALESCE($4, max_items),
         ai_managed = COALESCE($5, ai_managed),
         filter_category = COALESCE($6, filter_category),
         starts_at = $7,
         ends_at = $8,
         updated_by = $9,
         updated_at = now()
       WHERE id = $10 RETURNING *`,
      [
        title ?? null, subtitle ?? null, layout ?? null, maxItems ?? null, aiManaged ?? null,
        filterCategory ?? null,
        startsAt !== undefined ? (startsAt || null) : existingRows[0].starts_at,
        endsAt !== undefined ? (endsAt || null) : existingRows[0].ends_at,
        req.user.id, id
      ]
    );
    res.json({ section: rows[0] });
  } catch (err) {
    console.error('Admin update section error:', err);
    res.status(500).json({ error: 'Could not update section.' });
  }
}

export async function adminToggleEnabled(req, res) {
  try {
    const { rows } = await query(
      `UPDATE marketplace_sections SET is_enabled = $1, updated_by = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [Boolean(req.body.isEnabled), req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Section not found.' });
    res.json({ section: rows[0] });
  } catch (err) {
    console.error('Admin toggle section error:', err);
    res.status(500).json({ error: 'Could not update section.' });
  }
}

// Drag-and-drop reorder — body: { order: [sectionId, sectionId, ...] } in
// the new top-to-bottom order. Positions are assigned in steps of 10 so a
// future manual nudge doesn't require renumbering everything.
export async function adminReorderSections(req, res) {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) return res.status(400).json({ error: 'order must be a non-empty array of section ids.' });

    await withTransaction(async (client) => {
      for (let i = 0; i < order.length; i++) {
        await client.query(
          `UPDATE marketplace_sections SET position = $1, updated_by = $2, updated_at = now() WHERE id = $3`,
          [(i + 1) * 10, req.user.id, order[i]]
        );
      }
    });
    const { rows } = await query(`SELECT * FROM marketplace_sections ORDER BY position ASC`);
    res.json({ sections: rows });
  } catch (err) {
    console.error('Admin reorder sections error:', err);
    res.status(500).json({ error: 'Could not reorder sections.' });
  }
}

export async function adminDeleteSection(req, res) {
  try {
    const { rows } = await query(`SELECT is_system FROM marketplace_sections WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Section not found.' });
    if (rows[0].is_system) return res.status(400).json({ error: 'Built-in sections can be disabled but not deleted.' });
    await query(`DELETE FROM marketplace_sections WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete section error:', err);
    res.status(500).json({ error: 'Could not delete section.' });
  }
}

// --- Attachments: products ---------------------------------------------
export async function adminAttachProducts(req, res) {
  try {
    const { productIds } = req.body; // array, in desired order
    if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds must be an array.' });
    await withTransaction(async (client) => {
      for (let i = 0; i < productIds.length; i++) {
        await client.query(
          `INSERT INTO marketplace_section_products (section_id, product_id, position, added_by)
           VALUES ($1, $2, $3, 'admin')
           ON CONFLICT (section_id, product_id) DO UPDATE SET position = EXCLUDED.position`,
          [req.params.id, productIds[i], i]
        );
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin attach products error:', err);
    res.status(500).json({ error: 'Could not attach products.' });
  }
}

export async function adminDetachProduct(req, res) {
  try {
    await query(`DELETE FROM marketplace_section_products WHERE section_id = $1 AND product_id = $2`, [req.params.id, req.params.productId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin detach product error:', err);
    res.status(500).json({ error: 'Could not remove product.' });
  }
}

export async function adminReorderProducts(req, res) {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds must be an array.' });
    await withTransaction(async (client) => {
      for (let i = 0; i < productIds.length; i++) {
        await client.query(`UPDATE marketplace_section_products SET position = $1 WHERE section_id = $2 AND product_id = $3`, [i, req.params.id, productIds[i]]);
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin reorder products error:', err);
    res.status(500).json({ error: 'Could not reorder products.' });
  }
}

// --- Attachments: shops ---------------------------------------------
export async function adminAttachShops(req, res) {
  try {
    const { shopIds } = req.body;
    if (!Array.isArray(shopIds)) return res.status(400).json({ error: 'shopIds must be an array.' });
    await withTransaction(async (client) => {
      for (let i = 0; i < shopIds.length; i++) {
        await client.query(
          `INSERT INTO marketplace_section_shops (section_id, shop_id, position, added_by)
           VALUES ($1, $2, $3, 'admin')
           ON CONFLICT (section_id, shop_id) DO UPDATE SET position = EXCLUDED.position`,
          [req.params.id, shopIds[i], i]
        );
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin attach shops error:', err);
    res.status(500).json({ error: 'Could not attach shops.' });
  }
}

export async function adminDetachShop(req, res) {
  try {
    await query(`DELETE FROM marketplace_section_shops WHERE section_id = $1 AND shop_id = $2`, [req.params.id, req.params.shopId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin detach shop error:', err);
    res.status(500).json({ error: 'Could not remove shop.' });
  }
}

// --- Attachments: categories ---------------------------------------------
export async function adminAttachCategories(req, res) {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories must be an array.' });
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM marketplace_section_categories WHERE section_id = $1`, [req.params.id]);
      for (let i = 0; i < categories.length; i++) {
        await client.query(
          `INSERT INTO marketplace_section_categories (section_id, category, position) VALUES ($1, $2, $3)`,
          [req.params.id, categories[i], i]
        );
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin attach categories error:', err);
    res.status(500).json({ error: 'Could not attach categories.' });
  }
}

// --- Product/shop search for the "attach" picker ------------------------
export async function adminSearchProducts(req, res) {
  try {
    const search = `%${req.query.search || ''}%`;
    const { rows } = await query(
      `SELECT p.id, p.title, p.price, p.currency, p.images, p.category, p.status, p.orders_count, p.views_count, s.name AS shop_name
       FROM products p JOIN shops s ON s.id = p.shop_id
       WHERE p.status = 'active' AND (p.title ILIKE $1 OR p.category ILIKE $1)
       ORDER BY p.orders_count DESC LIMIT 30`,
      [search]
    );
    res.json({ products: rows });
  } catch (err) {
    console.error('Admin search products error:', err);
    res.status(500).json({ error: 'Could not search products.' });
  }
}

export async function adminSearchShops(req, res) {
  try {
    const search = `%${req.query.search || ''}%`;
    const { rows } = await query(
      `SELECT id, name, slug, logo_url, primary_category, status FROM shops
       WHERE status = 'active' AND name ILIKE $1 ORDER BY name ASC LIMIT 30`,
      [search]
    );
    res.json({ shops: rows });
  } catch (err) {
    console.error('Admin search shops error:', err);
    res.status(500).json({ error: 'Could not search shops.' });
  }
}
