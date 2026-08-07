// TAUSI Marketing Engine — the AI Marketing Assistant piece of TAUSI's
// remit. Generates ready-to-post copy (social post, ad, promo message,
// seasonal offer) grounded in a seller's real product data, and — for
// 'ad' — can submit a real ad_campaigns row in 'pending_review' so it
// flows through the existing admin review pipeline (tausiAdsEngine.js)
// exactly like an admin-created campaign would.
//
// Deterministic, rule-based, no external API — see
// backend/src/ai/orchestrator.js for the design rationale.

import { query } from '../../src/config/db.js';
import { createCampaign } from './tausiAdsEngine.js';
import { log } from './tausiService.js';

function heuristicCopy(kind, { shopName, product }) {
  const name = product?.title || `${shopName || 'our shop'}'s products`;
  const price = product ? `${product.currency} ${product.price}` : null;
  const base = {
    social_post: { headline: `New in at ${shopName || 'our shop'}! 🛍️`, body: `Check out ${name}${price ? ` — now ${price}` : ''}. Order securely on Jedida today.`, hashtags: ['#Jedida', '#ShopLocal'] },
    ad: { headline: `${name} — order on Jedida`, body: `${name}${price ? ` for ${price}` : ''}. Fast, secure ordering through Jedida.` },
    promo: { headline: `Still thinking about ${name}?`, body: `We noticed your interest — ${name} is still available${price ? ` at ${price}` : ''}. Message us on Jedida to order.` },
    seasonal: { headline: `Season's offer from ${shopName || 'our shop'}`, body: `Celebrate the season with ${name}${price ? ` at ${price}` : ''} — order through Jedida while stock lasts.` },
  };
  return base[kind] || base.social_post;
}

export async function generateMarketingCopy({ shopId, shopName, productId, kind = 'social_post' }) {
  let product = null;
  if (productId) {
    const result = await query(
      `SELECT id, title, description, price, currency, category FROM products WHERE id = $1 AND shop_id = $2`,
      [productId, shopId]
    );
    product = result.rows[0] || null;
  }

  const copy = heuristicCopy(kind, { shopName, product });

  return { kind, product: product ? { id: product.id, title: product.title } : null, ...copy };
}

// Submits the generated 'ad' copy as a real ad_campaigns draft for the
// seller's own shop — lands in 'pending_review', same status an
// admin-created campaign gets, reviewed via the existing TAUSI ads admin
// endpoint (POST /ai/tausi/campaigns/:id/review).
export async function submitAdCampaignDraft({ shopId, productId, title, budget }) {
  const campaign = await createCampaign({ shopId, productId, title, budget: budget || 0 });
  await log('tausi', 'info', 'ads', `Seller submitted campaign "${title}" for shop ${shopId} for review.`);
  return campaign;
}
