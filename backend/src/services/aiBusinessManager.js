// Jedida Bot — AI Business Manager.
// Job: given a shop's own sales, traffic, and inventory numbers, produce a
// plain-English health summary plus a short list of concrete recommendations
// the seller can act on with one click from the Shop Builder dashboard.
//
// Deliberately self-contained, like jedidaBot.js's Store Designer: no calls
// to Groq, Google AI Studio, or any other external LLM/analytics provider.
// Everything below is deterministic threshold/rule logic over numbers the
// controller already has — "AI Business Manager" here means automated
// business analysis, not a language model.

function pctChange(curr, prior) {
  if (prior === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prior) / prior) * 1000) / 10;
}

// ±5% is treated as noise, not a real trend — avoids flip-flopping between
// "up" and "down" on small week-to-week wobbles.
function trendDirection(changePercent) {
  if (changePercent >= 5) return 'up';
  if (changePercent <= -5) return 'down';
  return 'flat';
}

export function generateBusinessInsights({ shop, products, currentPeriod, priorPeriod, allowedBlocks }) {
  // Only ever suggest a block the account type can actually publish (see
  // blocksForRole in shopBuilderRoles.js) — a wholesale account has no
  // "Flash Sale" section, so its promotion recommendation should suggest
  // "Bulk Deals" instead, not a block that will 403 when applied.
  const pickAllowed = (candidates, fallback) => {
    if (!allowedBlocks) return candidates[0];
    return candidates.find((c) => allowedBlocks.includes(c)) || fallback;
  };
  const revenueChangePercent = pctChange(currentPeriod.revenue, priorPeriod.revenue);
  const salesTrend = {
    revenueThisPeriod: currentPeriod.revenue,
    revenuePriorPeriod: priorPeriod.revenue,
    ordersThisPeriod: currentPeriod.orderCount,
    ordersPriorPeriod: priorPeriod.orderCount,
    changePercent: revenueChangePercent,
    direction: trendDirection(revenueChangePercent)
  };

  const visitorsChangePercent = pctChange(currentPeriod.visitors, priorPeriod.visitors);
  const trafficTrend = {
    visitorsThisPeriod: currentPeriod.visitors,
    visitorsPriorPeriod: priorPeriod.visitors,
    changePercent: visitorsChangePercent,
    direction: trendDirection(visitorsChangePercent)
  };

  const conversionThisPeriod = currentPeriod.visitors > 0 ? (currentPeriod.orderCount / currentPeriod.visitors) * 100 : 0;
  const conversionPriorPeriod = priorPeriod.visitors > 0 ? (priorPeriod.orderCount / priorPeriod.visitors) * 100 : 0;

  // Naive one-period-ahead projection: "if the current change kept
  // happening at the same rate for another period." Not a statistical
  // forecast — just makes the trend concrete as a number, labelled as such
  // on the frontend so it isn't mistaken for a real prediction model.
  const projectedNextPeriodRevenue = Math.max(0, Math.round(currentPeriod.revenue + (currentPeriod.revenue - priorPeriod.revenue)));

  const slowMovers = products
    .filter((p) => p.views_count >= 5 && p.orders_count === 0)
    .sort((a, b) => b.views_count - a.views_count)
    .slice(0, 3)
    .map((p) => ({ id: p.id, title: p.title, viewsCount: p.views_count, reason: 'Getting views but no sales yet.' }));

  const fastMovers = products
    .filter((p) => p.orders_count >= 3 && p.quantity_available > 0 && p.quantity_available <= 3)
    .sort((a, b) => b.orders_count - a.orders_count)
    .slice(0, 3)
    .map((p) => ({ id: p.id, title: p.title, ordersCount: p.orders_count, quantityAvailable: p.quantity_available, reason: 'Selling well and running low on stock.' }));

  const recommendations = [];

  if (salesTrend.direction === 'down' && priorPeriod.revenue > 0) {
    const focus = slowMovers[0]?.title;
    const blockType = pickAllowed(['flash_sale', 'bulk_deals', 'todays_deals'], null);
    recommendations.push({
      type: 'promotion',
      title: 'Revenue is down — consider a flash sale',
      body: `Revenue is down ${Math.abs(revenueChangePercent)}% versus the prior period.${focus ? ` "${focus}" has views but no sales — a good candidate to feature.` : ''} A time-limited promotion section on your homepage can re-engage buyers.`,
      ...(blockType && { suggestedBlock: { blockType, config: { headline: focus ? `Flash Sale: ${focus}` : `${shop.name || 'Storewide'} Flash Sale` } } })
    });
  }

  if (trafficTrend.direction === 'up' && salesTrend.direction !== 'up') {
    const blockType = pickAllowed(['trust_badges'], null);
    recommendations.push({
      type: 'conversion',
      title: 'Traffic is growing faster than sales',
      body: `Visitors are up ${trafficTrend.changePercent}% but revenue hasn't kept pace — conversion is the likely bottleneck. Adding a Trust Badges or Reviews section can help undecided visitors buy.`,
      ...(blockType && { suggestedBlock: { blockType, config: {} } })
    });
  }

  slowMovers.slice(0, 2).forEach((p) => {
    const blockType = pickAllowed(['todays_deals', 'flash_sale', 'featured_products'], null);
    recommendations.push({
      type: 'promotion',
      title: `Feature "${p.title}"`,
      body: `${p.title} has ${p.viewsCount} views and no sales yet. A Today's Deals section can give it the push it needs.`,
      ...(blockType && { suggestedBlock: { blockType, config: { headline: `Today's Deal: ${p.title}` } } })
    });
  });

  fastMovers.forEach((p) => {
    recommendations.push({
      type: 'inventory',
      title: `Restock "${p.title}"`,
      body: `${p.title} has sold ${p.ordersCount} units with only ${p.quantityAvailable} left. Update your stock soon to avoid selling out and losing momentum.`
    });
  });

  if (slowMovers.length > 0 && fastMovers.length > 0) {
    recommendations.push({
      type: 'bundle',
      title: 'Bundle idea',
      body: `Pair "${fastMovers[0].title}" (a proven seller) with "${slowMovers[0].title}" (getting views but not converting) as a bundle deal — it can move more of both.`
    });
  }

  if (salesTrend.direction === 'down' || slowMovers.length > 0) {
    const codeBase = (shop.name || 'SAVE').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'SAVE';
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    recommendations.push({
      type: 'discount',
      title: 'Launch a 10% off coupon',
      body: 'A short, time-boxed discount can help convert hesitant buyers, especially on slower-moving items.',
      suggestedCoupon: { code: `${codeBase}10`, discountType: 'percent', discountValue: 10, minOrderAmount: 0, maxUses: null, expiresAt }
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'info',
      title: 'Your shop looks healthy',
      body: 'No red flags right now — sales, traffic, and stock all look reasonable. Check back here as trends shift.'
    });
  }

  return {
    salesTrend,
    trafficTrend,
    conversion: {
      thisPeriod: Math.round(conversionThisPeriod * 100) / 100,
      priorPeriod: Math.round(conversionPriorPeriod * 100) / 100
    },
    demandForecast: { projectedNextPeriodRevenue, direction: salesTrend.direction },
    slowMovers,
    fastMovers,
    recommendations
  };
}
