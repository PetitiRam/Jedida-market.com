// Amina — the AI Store Creation Assistant.
// Job: when a seller describes their business in plain language, turn that
// into real storefront copy — a tagline, a polished description (saved
// straight to shops.description, which the public shop page already
// renders), suggested category structure, section ideas (e.g. "Farm
// story", "Wholesale", "Export inquiry" for a coffee exporter), and banner
// copy.
//
// Deterministic, rule-based, no external API of any kind — the platform's
// AI ecosystem runs entirely on local logic (see
// backend/src/ai/orchestrator.js and its nlu/ pipeline for the design
// rationale). Section ideas vary by detected business category rather
// than being one generic set, so this doesn't read as flatly templated.
//
// Everything generated here is a *suggestion the seller reviews* — Amina
// writes shops.description + shops.ai_profile (both editable by the owner
// afterwards via the existing PATCH /shops/me), but never touches pricing,
// payments, or anything Jedida itself controls.

import { query } from '../config/db.js';
import { categorize } from '../../ai/tausi/tausiCategoryEngine.js';
import { addMemory } from './shopAiMemory.js';

// Extra homepage sections per category — beyond the two every shop gets
// ("About us", "How to order") — so a coffee exporter and a fashion
// seller don't get identical suggestions.
const CATEGORY_SECTIONS = {
  agriculture: [{ title: 'Farm story', body: 'Where and how we grow/source what we sell.' }, { title: 'Wholesale & export inquiry', body: 'Contact us for bulk pricing and export orders.' }],
  food: [{ title: 'Farm story', body: 'Where and how we grow/source what we sell.' }, { title: 'Wholesale & export inquiry', body: 'Contact us for bulk pricing and export orders.' }],
  fashion: [{ title: 'New arrivals', body: 'The latest pieces added to our shop.' }, { title: 'Size guide', body: 'How to pick the right size before you order.' }],
  electronics: [{ title: 'Warranty & support', body: 'What\'s covered and how to reach us if something goes wrong.' }, { title: 'Specs & compatibility', body: 'Detailed specs for every listing.' }],
  wholesale: [{ title: 'Bulk pricing', body: 'Quantity discounts and how to request a quote.' }, { title: 'Minimum order quantities', body: 'What we require per order.' }],
  crafts: [{ title: 'The making process', body: 'How each piece is made, by hand or otherwise.' }, { title: 'Custom orders', body: 'How to request something made to order.' }],
};

function heuristicDesign({ shopName, businessDescription }) {
  const { category } = categorize({ title: businessDescription, description: businessDescription });
  const niceCategory = category.replace(/_/g, ' ');
  const extraSections = CATEGORY_SECTIONS[category] || [];
  return {
    businessType: niceCategory,
    tagline: `Quality ${niceCategory}, straight from ${shopName || 'our shop'}.`,
    description: `${shopName || 'This shop'} sells ${businessDescription}. Browse our listings below, message us with any questions, and order securely through Jedida.`,
    categorySuggestions: [category, 'other'],
    sections: [
      { title: 'About us', body: businessDescription },
      { title: 'How to order', body: 'Browse our products, message us if you have questions, then order and pay securely through Jedida.' },
      ...extraSections,
    ],
    bannerHeadline: shopName || 'Welcome to our shop',
    bannerSubtext: businessDescription,
  };
}

export async function designStore({ shopId, shopName, businessDescription, overwriteDescription = false }) {
  const design = heuristicDesign({ shopName, businessDescription });

  const aiProfile = { ...design, generatedAt: new Date().toISOString() };

  if (shopId) {
    await query(
      `UPDATE shops SET description = ${overwriteDescription ? '$2' : 'COALESCE(description, $2)'}, ai_profile = $3 WHERE id = $1`,
      [shopId, design.description, JSON.stringify(aiProfile)]
    );
    await addMemory(shopId, {
      category: 'business_style',
      content: `Business type: ${design.businessType}. Seller's own description: "${businessDescription}".`,
      createdBy: 'ai',
    });
  }

  return aiProfile;
}
