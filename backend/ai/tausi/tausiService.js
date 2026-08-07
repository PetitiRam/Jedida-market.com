// TAUSI — AI Product Manager: categorization, ranking, recommendations,
// ads/campaign management, marketplace optimization, seller performance.
// Deterministic, rule-based, no external API — see
// backend/src/ai/orchestrator.js for the design rationale.

import { query } from '../../src/config/db.js';
import { log, recordAction } from '../petiti/petitiService.js';

export { log, recordAction };

export async function sellerPerformance(shopId) {
  const stats = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active') AS active_listings,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_listings,
      COALESCE(SUM(orders_count), 0) AS total_orders,
      COALESCE(SUM(views_count), 0) AS total_views
    FROM products WHERE shop_id = $1
  `, [shopId]);

  const row = stats.rows[0];
  const conversionRate = Number(row.total_views) > 0
    ? Number(((Number(row.total_orders) / Number(row.total_views)) * 100).toFixed(2))
    : 0;

  return {
    activeListings: Number(row.active_listings),
    rejectedListings: Number(row.rejected_listings),
    totalOrders: Number(row.total_orders),
    totalViews: Number(row.total_views),
    conversionRate
  };
}

export async function allSellerPerformance() {
  const shops = await query(`SELECT id, name FROM shops WHERE status = 'active'`);
  const results = [];
  for (const shop of shops.rows) {
    const perf = await sellerPerformance(shop.id);
    results.push({ shopId: shop.id, shopName: shop.name, ...perf });
  }
  return results.sort((a, b) => b.conversionRate - a.conversionRate);
}

// ---------------------------------------------------------------------------
// AI Business Analytics (seller-facing) — real per-product view/order/stock
// numbers plus an AI narrative in the "500 views but only 20 orders, improve
// your photos and pricing" style. Template-built from the real numbers —
// deterministic, no external API.
// ---------------------------------------------------------------------------
export async function shopAnalytics(shopId) {
  const productsResult = await query(
    `SELECT id, title, views_count, orders_count, quantity_available, price, currency, category
     FROM products WHERE shop_id = $1 AND status = 'active' ORDER BY views_count DESC`,
    [shopId]
  );
  const products = productsResult.rows;

  const totals = products.reduce((acc, p) => ({
    views: acc.views + (p.views_count || 0),
    orders: acc.orders + (p.orders_count || 0),
  }), { views: 0, orders: 0 });

  const lowStock = products.filter((p) => p.quantity_available > 0 && p.quantity_available <= 3);
  const outOfStock = products.filter((p) => p.quantity_available === 0);
  // High views, low conversion — the exact pattern called out in the brief.
  const underperformers = products.filter((p) => (p.views_count || 0) >= 20 && (p.orders_count || 0) / Math.max(p.views_count, 1) < 0.03);
  const topProducts = [...products].sort((a, b) => (b.orders_count || 0) - (a.orders_count || 0)).slice(0, 3);

  const facts = {
    totalViews: totals.views, totalOrders: totals.orders,
    conversionRate: totals.views > 0 ? Number(((totals.orders / totals.views) * 100).toFixed(1)) : 0,
    lowStock: lowStock.map((p) => ({ title: p.title, remaining: p.quantity_available })),
    outOfStock: outOfStock.map((p) => p.title),
    underperformers: underperformers.map((p) => ({ title: p.title, views: p.views_count, orders: p.orders_count })),
    topProducts: topProducts.map((p) => ({ title: p.title, orders: p.orders_count })),
  };

  const narrative = heuristicNarrative(facts);

  return { ...facts, ...narrative, products: products.slice(0, 20) };
}

function heuristicNarrative(facts) {
  const suggestions = [];
  const parts = [];
  parts.push(`You've had ${facts.totalViews} views and ${facts.totalOrders} orders (${facts.conversionRate}% conversion) across your active listings.`);
  if (facts.underperformers.length) {
    const p = facts.underperformers[0];
    parts.push(`"${p.title}" is getting attention (${p.views} views) but few orders (${p.orders}) — improve its photos, description, or pricing.`);
    suggestions.push(`Refresh the photos and description on "${p.title}".`);
  }
  if (facts.lowStock.length) {
    parts.push(`${facts.lowStock.length} listing(s) are low on stock.`);
    suggestions.push(`Restock: ${facts.lowStock.map((l) => l.title).join(', ')}.`);
  }
  if (facts.outOfStock.length) suggestions.push(`Mark or restock out-of-stock items: ${facts.outOfStock.join(', ')}.`);
  if (facts.topProducts.length) suggestions.push(`Your best seller is "${facts.topProducts[0].title}" — consider featuring it.`);
  if (!suggestions.length) suggestions.push('Keep listings fresh with clear photos and complete descriptions to keep growing.');
  return { summary: parts.join(' '), suggestions };
}
