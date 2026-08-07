// TAUSI Marketplace Automation — the 7 behaviors that keep the Jedida
// Market homepage curated without a human touching it every day.
// Deterministic, rule-based, no external API — same design as every other
// Tausi engine in this folder (see backend/src/ai/orchestrator.js for the
// rationale). Every behavior reads real product/shop/ad data, writes a
// real change (or a real suggestion for "recommend"-type behaviors), and
// logs what it did to tausi_marketplace_actions for the admin to review.
import { query, withTransaction } from '../../src/config/db.js';

const BEHAVIORS = [
  'choose_best_products',
  'replace_low_performers',
  'detect_outdated_banners',
  'rotate_featured_products',
  'refresh_category_images',
  'recommend_promotions',
  'suggest_seasonal_campaigns',
];

async function logAction(behavior, { targetType = null, targetId = null, summary, detail = {}, status = 'applied' }) {
  await query(
    `INSERT INTO tausi_marketplace_actions (behavior, target_type, target_id, summary, detail, status)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [behavior, targetType, targetId, summary, JSON.stringify(detail), status]
  );
}

async function markRun(behavior) {
  await query(`UPDATE tausi_marketplace_settings SET last_run_at = now() WHERE behavior = $1`, [behavior]);
}

// A single, shared "how good is this listing right now" score — orders
// weigh heaviest (real conversions), then view volume, and a bonus for
// actually having photos. All from real columns already on `products`.
function scoreExpr(alias = 'p') {
  return `(${alias}.orders_count * 5 + ${alias}.views_count * 0.05
           + CASE WHEN array_length(${alias}.images, 1) > 0 THEN 3 ELSE 0 END)`;
}

// ---------------------------------------------------------------------------
// 1. Choose the best products — for every AI-managed, manually-curated
// product section, fill/replace its attached products with the current
// top scorers (scoped to the section's category filter if it has one).
// ---------------------------------------------------------------------------
export async function chooseBestProducts() {
  const { rows: sections } = await query(
    `SELECT * FROM marketplace_sections WHERE section_kind = 'products' AND source_type = 'manual' AND ai_managed = TRUE`
  );
  let touched = 0;
  for (const section of sections) {
    const categoryClause = section.filter_category ? `AND p.category = $2` : '';
    const params = section.filter_category ? [section.max_items, section.filter_category] : [section.max_items];
    const { rows: best } = await query(
      `SELECT p.id FROM products p WHERE p.status = 'active' ${categoryClause}
       ORDER BY ${scoreExpr('p')} DESC LIMIT $1`,
      params
    );
    if (best.length === 0) continue;
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM marketplace_section_products WHERE section_id = $1`, [section.id]);
      for (let i = 0; i < best.length; i++) {
        await client.query(
          `INSERT INTO marketplace_section_products (section_id, product_id, position, added_by) VALUES ($1,$2,$3,'ai')`,
          [section.id, best[i].id, i]
        );
      }
    });
    touched++;
    await logAction('choose_best_products', {
      targetType: 'marketplace_section', targetId: section.id,
      summary: `Filled "${section.title}" with the ${best.length} top-scoring active products right now.`,
      detail: { productIds: best.map((b) => b.id) },
    });
  }
  await markRun('choose_best_products');
  return { sectionsUpdated: touched };
}

// ---------------------------------------------------------------------------
// 2. Replace low performers — within AI-managed sections, swap out any
// attached product scoring well below the section's own average for the
// next-best active candidate not already in the section.
// ---------------------------------------------------------------------------
export async function replaceLowPerformers() {
  const { rows: sections } = await query(
    `SELECT * FROM marketplace_sections WHERE section_kind = 'products' AND source_type = 'manual' AND ai_managed = TRUE`
  );
  let swaps = 0;
  for (const section of sections) {
    const { rows: attached } = await query(
      `SELECT p.id, ${scoreExpr('p')} AS score FROM marketplace_section_products msp
       JOIN products p ON p.id = msp.product_id WHERE msp.section_id = $1 AND p.status = 'active'`,
      [section.id]
    );
    if (attached.length < 3) continue;
    const avg = attached.reduce((sum, r) => sum + Number(r.score), 0) / attached.length;
    const laggards = attached.filter((r) => Number(r.score) < avg * 0.4);
    if (laggards.length === 0) continue;

    const categoryClause = section.filter_category ? `AND p.category = $3` : '';
    const excludeIds = attached.map((a) => a.id);
    const params = section.filter_category
      ? [excludeIds, laggards.length, section.filter_category]
      : [excludeIds, laggards.length];
    const { rows: replacements } = await query(
      `SELECT p.id FROM products p WHERE p.status = 'active' AND NOT (p.id = ANY($1::uuid[])) ${categoryClause}
       ORDER BY ${scoreExpr('p')} DESC LIMIT $2`,
      params
    );

    await withTransaction(async (client) => {
      for (let i = 0; i < laggards.length; i++) {
        const replacement = replacements[i];
        await client.query(`DELETE FROM marketplace_section_products WHERE section_id = $1 AND product_id = $2`, [section.id, laggards[i].id]);
        if (replacement) {
          await client.query(
            `INSERT INTO marketplace_section_products (section_id, product_id, position, added_by)
             VALUES ($1,$2, (SELECT COALESCE(MAX(position),0)+1 FROM marketplace_section_products WHERE section_id=$1), 'ai')
             ON CONFLICT (section_id, product_id) DO NOTHING`,
            [section.id, replacement.id]
          );
        }
      }
    });
    swaps += laggards.length;
    await logAction('replace_low_performers', {
      targetType: 'marketplace_section', targetId: section.id,
      summary: `Swapped ${laggards.length} underperforming product${laggards.length === 1 ? '' : 's'} out of "${section.title}".`,
      detail: { removedProductIds: laggards.map((l) => l.id), addedProductIds: replacements.map((r) => r.id) },
    });
  }
  await markRun('replace_low_performers');
  return { swaps };
}

// ---------------------------------------------------------------------------
// 3. Detect outdated banners — deactivate any active ad whose schedule has
// lapsed, or that has no end date and has been running unreviewed for 30+
// days.
// ---------------------------------------------------------------------------
export async function detectOutdatedBanners() {
  const { rows: stale } = await query(
    `SELECT id, title, placement FROM ads
     WHERE active = TRUE AND (
       (ends_at IS NOT NULL AND ends_at < now())
       OR (ends_at IS NULL AND created_at < now() - interval '30 days')
     )`
  );
  if (stale.length > 0) {
    await query(`UPDATE ads SET active = FALSE WHERE id = ANY($1::uuid[])`, [stale.map((s) => s.id)]);
  }
  for (const ad of stale) {
    await logAction('detect_outdated_banners', {
      targetType: 'ad', targetId: ad.id,
      summary: `Deactivated outdated "${ad.placement}" banner "${ad.title}".`,
    });
  }
  await markRun('detect_outdated_banners');
  return { deactivated: stale.length };
}

// ---------------------------------------------------------------------------
// 4. Rotate featured products — unfeature the weakest currently-featured
// listings and promote the strongest non-featured ones, keeping the
// featured count roughly stable.
// ---------------------------------------------------------------------------
const FEATURED_TARGET = 24;

export async function rotateFeaturedProducts() {
  const { rows: featured } = await query(
    `SELECT id, ${scoreExpr('p')} AS score FROM products p WHERE status = 'active' AND is_featured = TRUE ORDER BY score ASC`
  );
  const overflow = Math.max(0, featured.length - FEATURED_TARGET);
  const bottomQuartileCount = Math.max(overflow, Math.floor(featured.length * 0.15));
  const toUnfeature = featured.slice(0, Math.min(bottomQuartileCount, featured.length));

  const { rows: candidates } = await query(
    `SELECT id FROM products WHERE status = 'active' AND is_featured = FALSE
     ORDER BY ${scoreExpr()} DESC LIMIT $1`,
    [toUnfeature.length]
  );

  await withTransaction(async (client) => {
    if (toUnfeature.length > 0) {
      await client.query(`UPDATE products SET is_featured = FALSE WHERE id = ANY($1::uuid[])`, [toUnfeature.map((f) => f.id)]);
    }
    if (candidates.length > 0) {
      await client.query(`UPDATE products SET is_featured = TRUE WHERE id = ANY($1::uuid[])`, [candidates.map((c) => c.id)]);
    }
  });

  await logAction('rotate_featured_products', {
    summary: `Rotated featured products: unfeatured ${toUnfeature.length}, promoted ${candidates.length} fresh top performers.`,
    detail: { unfeaturedIds: toUnfeature.map((f) => f.id), featuredIds: candidates.map((c) => c.id) },
  });
  await markRun('rotate_featured_products');
  return { unfeatured: toUnfeature.length, featured: candidates.length };
}

// ---------------------------------------------------------------------------
// 5. Refresh category images — re-run the live "best current photo per
// category" query and record which categories' representative image
// actually changed since the last run.
// ---------------------------------------------------------------------------
export async function refreshCategoryImages() {
  const { rows: live } = await query(
    `SELECT DISTINCT ON (category) category, images[1] AS image_url
     FROM products WHERE status = 'active' AND array_length(images, 1) > 0
     ORDER BY category, is_featured DESC, orders_count DESC, created_at DESC`
  );
  const { rows: prevRows } = await query(`SELECT category, image_url FROM category_image_snapshot`);
  const prev = Object.fromEntries(prevRows.map((r) => [r.category, r.image_url]));

  const changed = live.filter((r) => prev[r.category] !== r.image_url);
  await withTransaction(async (client) => {
    for (const row of live) {
      await client.query(
        `INSERT INTO category_image_snapshot (category, image_url, updated_at) VALUES ($1,$2, now())
         ON CONFLICT (category) DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = now()`,
        [row.category, row.image_url]
      );
    }
  });

  await logAction('refresh_category_images', {
    summary: changed.length > 0
      ? `Refreshed ${changed.length} category image${changed.length === 1 ? '' : 's'} to the current best live listing photo.`
      : `Checked all categories — every category image already matches the current best live listing photo.`,
    detail: { changedCategories: changed.map((c) => c.category) },
  });
  await markRun('refresh_category_images');
  return { changed: changed.length, total: live.length };
}

// ---------------------------------------------------------------------------
// 6. Recommend promotions — flag active, on-sale-eligible products with
// high traffic but a weak view-to-order ratio (a real conversion problem a
// coupon could fix) as a suggestion, not an auto-applied change.
// ---------------------------------------------------------------------------
export async function recommendPromotions() {
  const { rows: candidates } = await query(
    `SELECT p.id, p.title, p.views_count, p.orders_count, p.price, s.name AS shop_name
     FROM products p JOIN shops s ON s.id = p.shop_id
     WHERE p.status = 'active' AND p.views_count >= 50
       AND (p.orders_count::float / GREATEST(p.views_count, 1)) < 0.02
     ORDER BY p.views_count DESC LIMIT 10`
  );
  for (const p of candidates) {
    await logAction('recommend_promotions', {
      targetType: 'product', targetId: p.id, status: 'suggested',
      summary: `"${p.title}" (${p.shop_name}) has ${p.views_count} views but only ${p.orders_count} orders — consider a limited-time coupon to convert that traffic.`,
      detail: { views: p.views_count, orders: p.orders_count, price: p.price },
    });
  }
  await markRun('recommend_promotions');
  return { suggestions: candidates.length };
}

// ---------------------------------------------------------------------------
// 7. Suggest seasonal campaigns — match the current month to a season/
// holiday relevant to the Jedida Market catalogue, and suggest a hero
// campaign if there isn't already a live one targeting it.
// ---------------------------------------------------------------------------
const SEASONAL_CALENDAR = [
  { months: [11, 0], name: 'Festive Season', categories: ['fashion', 'electronics', 'toys_and_kids'] },
  { months: [0], name: 'New Year Fresh Start', categories: ['health_and_beauty', 'sports_and_outdoors'] },
  { months: [2, 3, 4], name: 'Planting Season', categories: ['agriculture'] },
  { months: [7, 8], name: 'Back to School', categories: ['books_and_media', 'fashion'] },
  { months: [10], name: 'Black Friday', categories: ['electronics', 'fashion', 'home_and_garden'] },
];

export async function suggestSeasonalCampaigns() {
  const month = new Date().getMonth();
  const active = SEASONAL_CALENDAR.filter((s) => s.months.includes(month));
  let suggestions = 0;
  for (const season of active) {
    const { rows: existing } = await query(
      `SELECT id FROM ads WHERE active = TRUE AND placement = 'hero'
         AND target_category = ANY($1::text[]) AND (ends_at IS NULL OR ends_at >= now())`,
      [season.categories]
    );
    if (existing.length > 0) continue;
    await logAction('suggest_seasonal_campaigns', {
      status: 'suggested',
      summary: `No live hero campaign for "${season.name}" — consider a seasonal banner for ${season.categories.join(', ')}.`,
      detail: { season: season.name, categories: season.categories },
    });
    suggestions++;
  }
  await markRun('suggest_seasonal_campaigns');
  return { suggestions };
}

const RUNNERS = {
  choose_best_products: chooseBestProducts,
  replace_low_performers: replaceLowPerformers,
  detect_outdated_banners: detectOutdatedBanners,
  rotate_featured_products: rotateFeaturedProducts,
  refresh_category_images: refreshCategoryImages,
  recommend_promotions: recommendPromotions,
  suggest_seasonal_campaigns: suggestSeasonalCampaigns,
};

export async function runBehavior(behavior) {
  if (!RUNNERS[behavior]) throw new Error(`Unknown Tausi marketplace behavior: ${behavior}`);
  return RUNNERS[behavior]();
}

export async function runAllEnabled() {
  const { rows: settings } = await query(`SELECT behavior FROM tausi_marketplace_settings WHERE is_enabled = TRUE`);
  const results = {};
  for (const { behavior } of settings) {
    if (!RUNNERS[behavior]) continue;
    try {
      results[behavior] = await RUNNERS[behavior]();
    } catch (err) {
      console.error(`Tausi marketplace behavior "${behavior}" failed:`, err);
      results[behavior] = { error: err.message };
    }
  }
  return results;
}

export { BEHAVIORS };
