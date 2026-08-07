import { query, withTransaction } from '../config/db.js';
import { generateStoreDesign } from '../services/jedidaBot.js';
import { generateBusinessInsights } from '../services/aiBusinessManager.js';
import { ALL_THEMES, ALL_BLOCK_TYPES, themesForRole, blocksForRole } from '../constants/shopBuilderRoles.js';

const LAYOUTS = ['standard', 'wide', 'gallery', 'magazine'];

async function getOwnedShop(userId) {
  const result = await query('SELECT * FROM shops WHERE owner_id = $1', [userId]);
  return result.rows[0] || null;
}

async function getUserRole(userId) {
  const result = await query('SELECT primary_role FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.primary_role;
}

// ------------------------------------------------------------
// THEME / LAYOUT / BRANDING — applies immediately, same as the rest of
// Shop Settings (updateShopSettings in shopsController.js).
// ------------------------------------------------------------
export async function getBuilderState(req, res) {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Open your shop before using the Shop Builder.' });

    const role = await getUserRole(req.user.id);
    const blocksResult = await query(
      'SELECT * FROM shop_blocks WHERE shop_id = $1 ORDER BY position ASC',
      [shop.id]
    );

    const availability = await query('SELECT theme, is_enabled FROM shop_theme_availability');
    const disabledThemes = availability.rows.filter((r) => !r.is_enabled).map((r) => r.theme);

    return res.json({
      shop,
      blocks: blocksResult.rows,
      themes: themesForRole(role).filter((t) => !disabledThemes.includes(t)),
      layouts: LAYOUTS,
      blockTypes: blocksForRole(role)
    });
  } catch (err) {
    console.error('Get builder state error:', err);
    return res.status(500).json({ error: 'Could not load your Shop Builder.' });
  }
}

export async function updateTheme(req, res) {
  const { theme, layoutStyle, fontFamily, themePrimaryColor, themeAccentColor } = req.body;
  if (theme && !ALL_THEMES.includes(theme)) return res.status(400).json({ error: 'Unknown theme.' });
  if (layoutStyle && !LAYOUTS.includes(layoutStyle)) return res.status(400).json({ error: 'Unknown layout style.' });

  try {
    if (theme) {
      const role = await getUserRole(req.user.id);
      if (!themesForRole(role).includes(theme)) {
        return res.status(403).json({ error: 'That theme is not available for your account type.' });
      }
      const availability = await query('SELECT is_enabled FROM shop_theme_availability WHERE theme = $1', [theme]);
      if (availability.rows[0]?.is_enabled === false) {
        return res.status(403).json({ error: 'That theme is not currently available.' });
      }
    }

    const result = await query(
      `UPDATE shops SET
         theme = COALESCE($1, theme),
         layout_style = COALESCE($2, layout_style),
         font_family = COALESCE($3, font_family),
         theme_primary_color = COALESCE($4, theme_primary_color),
         theme_accent_color = COALESCE($5, theme_accent_color)
       WHERE owner_id = $6 RETURNING *`,
      [theme || null, layoutStyle || null, fontFamily || null, themePrimaryColor || null, themeAccentColor || null, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No shop found for your account.' });
    return res.json({ message: 'Theme updated. Changes are live on your public shop page immediately.', shop: result.rows[0] });
  } catch (err) {
    console.error('Update theme error:', err);
    return res.status(500).json({ error: 'Could not update your theme.' });
  }
}

// ------------------------------------------------------------
// BLOCKS — draft-and-publish. Owner always sees every block (draft
// state); the public shop page only ever sees is_published = TRUE rows
// (see getPublicShopBySlugV2 in shopsController.js).
// ------------------------------------------------------------
export async function addBlock(req, res) {
  const { blockType, config } = req.body;
  if (!ALL_BLOCK_TYPES.includes(blockType)) return res.status(400).json({ error: 'Unknown block type.' });

  try {
    const role = await getUserRole(req.user.id);
    if (!blocksForRole(role).includes(blockType)) {
      return res.status(403).json({ error: 'That block isn\u2019t available for your account type.' });
    }

    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Open your shop before adding blocks.' });

    const maxPos = await query('SELECT COALESCE(MAX(position), -1) AS max FROM shop_blocks WHERE shop_id = $1', [shop.id]);
    const position = Number(maxPos.rows[0].max) + 1;

    const result = await query(
      `INSERT INTO shop_blocks (shop_id, block_type, position, config)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [shop.id, blockType, position, config || {}]
    );
    return res.status(201).json({ message: 'Block added to your draft layout.', block: result.rows[0] });
  } catch (err) {
    console.error('Add block error:', err);
    return res.status(500).json({ error: 'Could not add block.' });
  }
}

export async function updateBlock(req, res) {
  const { config, isVisible, isLocked } = req.body;
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    const result = await query(
      `UPDATE shop_blocks SET
         config = COALESCE($1, config),
         is_visible = COALESCE($2, is_visible),
         is_locked = COALESCE($3, is_locked)
       WHERE id = $4 AND shop_id = $5 RETURNING *`,
      [config || null, isVisible === undefined ? null : isVisible, isLocked === undefined ? null : isLocked, req.params.id, shop.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Block not found.' });
    return res.json({ message: 'Block updated in your draft layout.', block: result.rows[0] });
  } catch (err) {
    console.error('Update block error:', err);
    return res.status(500).json({ error: 'Could not update block.' });
  }
}

export async function deleteBlock(req, res) {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    const existing = await query('SELECT is_locked FROM shop_blocks WHERE id = $1 AND shop_id = $2', [req.params.id, shop.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Block not found.' });
    if (existing.rows[0].is_locked) return res.status(409).json({ error: 'Unlock this section before removing it.' });

    await query('DELETE FROM shop_blocks WHERE id = $1 AND shop_id = $2', [req.params.id, shop.id]);
    return res.json({ message: 'Block removed from your draft layout.' });
  } catch (err) {
    console.error('Delete block error:', err);
    return res.status(500).json({ error: 'Could not remove block.' });
  }
}

// Duplicate an existing block immediately after itself, copying its
// config/visibility so a seller can quickly build variants (e.g. two
// Featured Products rows with different collections) without retyping.
// The copy is never locked, even if the source block is.
export async function duplicateBlock(req, res) {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    const source = await query('SELECT * FROM shop_blocks WHERE id = $1 AND shop_id = $2', [req.params.id, shop.id]);
    if (source.rows.length === 0) return res.status(404).json({ error: 'Block not found.' });
    const block = source.rows[0];

    const duplicated = await withTransaction(async (client) => {
      // Shift every block after this one down by one position to make room,
      // then insert the copy directly after the source.
      await client.query(
        'UPDATE shop_blocks SET position = position + 1 WHERE shop_id = $1 AND position > $2',
        [shop.id, block.position]
      );
      const inserted = await client.query(
        `INSERT INTO shop_blocks (shop_id, block_type, position, config, is_visible)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [shop.id, block.block_type, block.position + 1, block.config, block.is_visible]
      );
      return inserted.rows[0];
    });

    const all = await query('SELECT * FROM shop_blocks WHERE shop_id = $1 ORDER BY position ASC', [shop.id]);
    return res.status(201).json({ message: 'Section duplicated.', block: duplicated, blocks: all.rows });
  } catch (err) {
    console.error('Duplicate block error:', err);
    return res.status(500).json({ error: 'Could not duplicate block.' });
  }
}

// Body: { orderedBlockIds: [uuid, uuid, ...] } — full ordered list of this
// shop's block ids after a drag-and-drop rearrange.
export async function reorderBlocks(req, res) {
  const { orderedBlockIds } = req.body;
  if (!Array.isArray(orderedBlockIds) || orderedBlockIds.length === 0) {
    return res.status(400).json({ error: 'orderedBlockIds is required.' });
  }
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    const current = await query('SELECT id, position, is_locked FROM shop_blocks WHERE shop_id = $1', [shop.id]);
    const byId = new Map(current.rows.map((b) => [b.id, b]));
    const lockedMoved = orderedBlockIds.some((id, i) => byId.get(id)?.is_locked && byId.get(id)?.position !== i);
    if (lockedMoved) return res.status(409).json({ error: 'Unlock all locked sections before reordering.' });

    await withTransaction(async (client) => {
      for (let i = 0; i < orderedBlockIds.length; i += 1) {
        await client.query(
          'UPDATE shop_blocks SET position = $1 WHERE id = $2 AND shop_id = $3',
          [i, orderedBlockIds[i], shop.id]
        );
      }
    });

    const result = await query('SELECT * FROM shop_blocks WHERE shop_id = $1 ORDER BY position ASC', [shop.id]);
    return res.json({ message: 'Layout order saved to your draft.', blocks: result.rows });
  } catch (err) {
    console.error('Reorder blocks error:', err);
    return res.status(500).json({ error: 'Could not save the new order.' });
  }
}

// Preview — owner-only view of the draft layout exactly as it will
// appear once published, regardless of is_published state.
export async function previewBlocks(req, res) {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });
    const result = await query(
      'SELECT * FROM shop_blocks WHERE shop_id = $1 AND is_visible = TRUE ORDER BY position ASC',
      [shop.id]
    );
    return res.json({ shop, blocks: result.rows });
  } catch (err) {
    console.error('Preview blocks error:', err);
    return res.status(500).json({ error: 'Could not load preview.' });
  }
}

export async function publishBlocks(req, res) {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    await query('UPDATE shop_blocks SET is_published = TRUE WHERE shop_id = $1', [shop.id]);
    await query('UPDATE shops SET blocks_published_at = now() WHERE id = $1', [shop.id]);

    return res.json({ message: 'Your storefront layout is now live.' });
  } catch (err) {
    console.error('Publish blocks error:', err);
    return res.status(500).json({ error: 'Could not publish your layout.' });
  }
}

// ------------------------------------------------------------
// AI STORE DESIGNER (Jedida Bot)
// ------------------------------------------------------------
export async function aiDesignStore(req, res) {
  const { description, category, apply } = req.body;
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'Open your shop before using the AI Store Designer.' });

    const role = await getUserRole(req.user.id);
    const design = await generateStoreDesign({
      shopName: shop.name,
      businessType: role,
      description: description || shop.description,
      category: category || shop.primary_category,
      allowedThemes: themesForRole(role),
      allowedBlocks: blocksForRole(role)
    });

    if (!apply) {
      return res.json({ design });
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE shops SET
           theme = $1, theme_primary_color = $2, theme_accent_color = $3,
           description = COALESCE(description, $4), ai_designed = TRUE
         WHERE id = $5`,
        [design.theme, design.colors.primary, design.colors.accent, design.businessDescription, shop.id]
      );
      // Jedida Bot designs a fresh layout: applying it replaces the current
      // draft rather than appending to it, matching what the dashboard's
      // "Apply this design" action shows the seller in preview.
      await client.query('DELETE FROM shop_blocks WHERE shop_id = $1', [shop.id]);
      for (const block of design.blocks) {
        await client.query(
          `INSERT INTO shop_blocks (shop_id, block_type, position, config) VALUES ($1, $2, $3, $4)`,
          [shop.id, block.blockType, block.position, block.config]
        );
      }
    });

    const [shopResult, blocksResult] = await Promise.all([
      query('SELECT * FROM shops WHERE id = $1', [shop.id]),
      query('SELECT * FROM shop_blocks WHERE shop_id = $1 ORDER BY position ASC', [shop.id])
    ]);

    return res.json({
      message: 'Jedida Bot designed your storefront. Preview it, then publish when you\u2019re ready.',
      design,
      shop: shopResult.rows[0],
      blocks: blocksResult.rows
    });
  } catch (err) {
    console.error('AI design store error:', err);
    return res.status(500).json({ error: 'Could not generate a store design right now.' });
  }
}

// ------------------------------------------------------------
// ANALYTICS — public tracking beacon + owner-facing summary.
// ------------------------------------------------------------
export async function trackShopEvent(req, res) {
  const { shopId, eventType, productId } = req.body;
  if (!shopId || !['shop_visit', 'product_view'].includes(eventType)) {
    return res.status(400).json({ error: 'shopId and a valid eventType are required.' });
  }
  try {
    await query(
      `INSERT INTO shop_analytics_events (shop_id, event_type, product_id, visitor_id) VALUES ($1, $2, $3, $4)`,
      [shopId, eventType, productId || null, req.user?.id || null]
    );
    return res.status(204).end();
  } catch (err) {
    // Analytics is best-effort — never break the storefront over a tracking failure.
    console.error('Track shop event error:', err);
    return res.status(204).end();
  }
}

export async function getShopAnalytics(req, res) {
  const { days = 30 } = req.query;
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    const since = `now() - interval '${Number(days) || 30} days'`;

    const [visitsResult, viewsResult, popularResult, ordersResult, questionsResult] = await Promise.all([
      query(`SELECT COUNT(*) AS count FROM shop_analytics_events WHERE shop_id = $1 AND event_type = 'shop_visit' AND created_at >= ${since}`, [shop.id]),
      query(`SELECT COUNT(*) AS count FROM shop_analytics_events WHERE shop_id = $1 AND event_type = 'product_view' AND created_at >= ${since}`, [shop.id]),
      query(
        `SELECT p.id, p.title, COUNT(e.id) AS views
         FROM shop_analytics_events e JOIN products p ON p.id = e.product_id
         WHERE e.shop_id = $1 AND e.event_type = 'product_view' AND e.created_at >= ${since}
         GROUP BY p.id, p.title ORDER BY views DESC LIMIT 5`,
        [shop.id]
      ),
      query(
        `SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0) AS revenue
         FROM orders WHERE shop_id = $1 AND created_at >= ${since}`,
        [shop.id]
      ),
      query(
        `SELECT COUNT(*) AS count FROM product_questions q JOIN products p ON p.id = q.product_id
         WHERE p.shop_id = $1 AND q.created_at >= ${since}`,
        [shop.id]
      )
    ]);

    const visitors = Number(visitsResult.rows[0].count);
    const orderCount = Number(ordersResult.rows[0].order_count);

    return res.json({
      periodDays: Number(days) || 30,
      visitors,
      productViews: Number(viewsResult.rows[0].count),
      orders: orderCount,
      revenue: Number(ordersResult.rows[0].revenue),
      conversionRate: visitors > 0 ? Number(((orderCount / visitors) * 100).toFixed(2)) : 0,
      customerQuestions: Number(questionsResult.rows[0].count),
      popularProducts: popularResult.rows
    });
  } catch (err) {
    console.error('Get shop analytics error:', err);
    return res.status(500).json({ error: 'Could not load shop analytics.' });
  }
}

// ------------------------------------------------------------
// AI BUSINESS MANAGER — same underlying numbers as getShopAnalytics above,
// but compared against the prior period and run through
// aiBusinessManager.js's rule engine to produce concrete, appliable
// recommendations instead of just raw counts.
// ------------------------------------------------------------
export async function getBusinessInsights(req, res) {
  const { days = 30 } = req.query;
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(404).json({ error: 'No shop found for your account.' });

    const periodDays = Number(days) || 30;
    const currentSince = `now() - interval '${periodDays} days'`;
    const priorSince = `now() - interval '${periodDays * 2} days'`;

    const [productsResult, currentOrders, priorOrders, currentVisits, priorVisits] = await Promise.all([
      query(
        `SELECT id, title, category, price, quantity_available, views_count, orders_count, created_at
         FROM products WHERE shop_id = $1`,
        [shop.id]
      ),
      query(
        `SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0) AS revenue
         FROM orders WHERE shop_id = $1 AND status != 'cancelled' AND created_at >= ${currentSince}`,
        [shop.id]
      ),
      query(
        `SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0) AS revenue
         FROM orders WHERE shop_id = $1 AND status != 'cancelled' AND created_at >= ${priorSince} AND created_at < ${currentSince}`,
        [shop.id]
      ),
      query(
        `SELECT COUNT(*) AS count FROM shop_analytics_events
         WHERE shop_id = $1 AND event_type = 'shop_visit' AND created_at >= ${currentSince}`,
        [shop.id]
      ),
      query(
        `SELECT COUNT(*) AS count FROM shop_analytics_events
         WHERE shop_id = $1 AND event_type = 'shop_visit' AND created_at >= ${priorSince} AND created_at < ${currentSince}`,
        [shop.id]
      )
    ]);

    const role = await getUserRole(req.user.id);
    const insights = generateBusinessInsights({
      shop,
      products: productsResult.rows,
      allowedBlocks: blocksForRole(role),
      currentPeriod: {
        revenue: Number(currentOrders.rows[0].revenue),
        orderCount: Number(currentOrders.rows[0].order_count),
        visitors: Number(currentVisits.rows[0].count)
      },
      priorPeriod: {
        revenue: Number(priorOrders.rows[0].revenue),
        orderCount: Number(priorOrders.rows[0].order_count),
        visitors: Number(priorVisits.rows[0].count)
      }
    });

    return res.json({ periodDays, ...insights });
  } catch (err) {
    console.error('Get business insights error:', err);
    return res.status(500).json({ error: 'Could not generate business insights.' });
  }
}

// ------------------------------------------------------------
// CONTENT REPORTS — any signed-in user can flag a shop's custom
// Shop Builder content for abuse review.
// ------------------------------------------------------------
export async function reportShopContent(req, res) {
  const { shopId, blockId, reason } = req.body;
  if (!shopId || !reason) return res.status(400).json({ error: 'shopId and reason are required.' });
  try {
    const result = await query(
      `INSERT INTO shop_content_reports (shop_id, block_id, reported_by, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [shopId, blockId || null, req.user.id, reason]
    );
    return res.status(201).json({ message: 'Thanks — our team will review this shop.', report: result.rows[0] });
  } catch (err) {
    console.error('Report shop content error:', err);
    return res.status(500).json({ error: 'Could not submit report.' });
  }
}
