// Nsubuga Joseph — the product-management AI bot.
// Job: clean up seller-submitted listings before they reach pending_review —
// fixing casing/formatting, tightening titles, filling a short description
// when the seller left one blank, and flagging anything that looks incomplete.
//
// Deterministic, rule-based, no external API — see
// backend/src/ai/orchestrator.js for the design rationale behind running
// the whole AI ecosystem on local logic rather than an LLM.

import { query } from '../config/db.js';
import { categorize } from '../../ai/tausi/tausiCategoryEngine.js';

function titleCase(str = '') {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function heuristicPolish({ title, description, category, specs }) {
  const notes = [];

  let polishedTitle = (title || '').trim();
  if (polishedTitle.length > 80) {
    notes.push('Title shortened to fit marketplace display.');
    polishedTitle = polishedTitle.slice(0, 80).trim();
  }
  polishedTitle = titleCase(polishedTitle);

  let polishedDescription = (description || '').trim();
  if (!polishedDescription) {
    const specEntries = specs ? Object.entries(specs).filter(([, v]) => v) : [];
    const specLine = specEntries.length
      ? ` Key details: ${specEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}.`
      : '';
    polishedDescription = `${polishedTitle} — listed in the ${(category || 'general').replace('_', ' ')} category on JEDIDA Marketplace.${specLine}`;
    notes.push('Generated a starter description from the listing details — the seller can edit it any time.');
  }

  if (!specs || Object.keys(specs).length === 0) {
    notes.push('No specs provided — consider adding details like size, material or origin to help buyers compare.');
  }

  return { title: polishedTitle, description: polishedDescription, notes: notes.join(' ') };
}

export async function polishListing({ title, description, category, specs }) {
  return heuristicPolish({ title, description, category, specs });
}

// ---------------------------------------------------------------------------
// Full product-manager pass: polish + missing-info detection + a real
// pricing comparison against other active listings in the same category +
// a category suggestion (reusing TAUSI's categorizer rather than a second,
// inconsistent classifier). Read-only — returns guidance, never edits the
// listing itself (that stays the seller's call via the product form).
// ---------------------------------------------------------------------------
export async function analyzeProduct({ title, description, category, price, currency, images, specs }) {
  const polished = await polishListing({ title, description, category, specs });

  const missingInfo = [];
  if (!images || images.length === 0) missingInfo.push('No product images — listings with photos get far more views.');
  if (!specs || Object.keys(specs).length === 0) missingInfo.push('No specs filled in — add details like size, material, or origin so buyers can compare.');
  if (!description || description.trim().length < 20) missingInfo.push('Description is very short — buyers want to know more before ordering.');
  if (!price || Number(price) <= 0) missingInfo.push('No price set.');

  const { category: suggestedCategory, confidence } = categorize({ title, description });

  let pricing = null;
  if (price && category) {
    const result = await query(
      `SELECT AVG(price)::numeric(12,2) AS avg_price, COUNT(*)::int AS sample_size
       FROM products WHERE category = $1 AND status = 'active' AND currency = $2`,
      [category, currency || 'USD']
    );
    const row = result.rows[0];
    if (row?.sample_size > 0) {
      const avg = Number(row.avg_price);
      const diffPct = Math.round(((Number(price) - avg) / avg) * 100);
      pricing = {
        categoryAveragePrice: avg,
        sampleSize: row.sample_size,
        diffPct,
        guidance: diffPct > 40
          ? `Your price is ${diffPct}% above similar ${category.replace(/_/g, ' ')} listings (avg ${currency || 'USD'} ${avg}) — make sure the description justifies it.`
          : diffPct < -40
          ? `Your price is ${Math.abs(diffPct)}% below similar listings (avg ${currency || 'USD'} ${avg}) — double-check it's intentional.`
          : `Your price is in line with similar ${category.replace(/_/g, ' ')} listings (avg ${currency || 'USD'} ${avg}).`,
      };
    }
  }

  return {
    polishedTitle: polished.title,
    polishedDescription: polished.description,
    notes: polished.notes,
    missingInfo,
    categorySuggestion: category && category !== suggestedCategory && confidence > 0
      ? { suggested: suggestedCategory, confidence }
      : null,
    pricing,
  };
}
