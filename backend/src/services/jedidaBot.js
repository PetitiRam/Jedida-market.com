// Jedida Bot — AI Store Designer.
// Job: given a seller's business description/category, propose a theme,
// accent colors, and a starter block layout for their Shop Builder draft.
//
// NOTE: this file was not present in the uploaded shop-builder module (it
// was imported by shopBuilderController.js's aiDesignStore() but missing
// from the package). Reconstructed here as a deterministic, self-contained
// generator — same "no external LLM call" pattern already used by
// aiBusinessManager.js in this same module — so the AI Store Designer
// button in the dashboard has something to call. This is independent from
// Amina (storeDesignerBot.js), which writes storefront copy/description
// text rather than theme + block layout.

const THEME_COLORS = {
  retail: { primary: '#1B4332', accent: '#E0A93C' },
  wholesale: { primary: '#22333B', accent: '#C6AC8F' },
  farm: { primary: '#3A5A40', accent: '#DDA15E' },
  brand: { primary: '#14213D', accent: '#FCA311' },
  coffee_export: { primary: '#4B3621', accent: '#C08552' },
  electronics: { primary: '#111827', accent: '#38BDF8' },
  fashion: { primary: '#3B0764', accent: '#F0ABFC' },
  furniture: { primary: '#5C4033', accent: '#D2B48C' },
  beauty: { primary: '#831843', accent: '#FBCFE8' },
  restaurant: { primary: '#7C2D12', accent: '#FACC15' },
  pharmacy: { primary: '#075985', accent: '#7DD3FC' },
  automotive: { primary: '#18181B', accent: '#EF4444' },
  construction: { primary: '#78350F', accent: '#FBBF24' },
  corporate: { primary: '#1E3A5F', accent: '#94A3B8' },
  luxury: { primary: '#111111', accent: '#D4AF37' },
  minimal: { primary: '#1F2937', accent: '#9CA3AF' },
  modern: { primary: '#0F172A', accent: '#6366F1' },
  dark: { primary: '#000000', accent: '#8B5CF6' },
  creative: { primary: '#701A75', accent: '#F97316' },
  marketplace: { primary: '#134E4A', accent: '#F59E0B' },
  enterprise: { primary: '#1E293B', accent: '#0EA5E9' }
};

// Keyword → theme, checked in order against the business description/category.
const THEME_KEYWORDS = [
  [/coffee|cocoa|export/i, 'coffee_export'],
  [/farm|agricultur|harvest|crop/i, 'farm'],
  [/wholesale|bulk|distributor/i, 'wholesale'],
  [/electronic|gadget|tech/i, 'electronics'],
  [/fashion|cloth|apparel|boutique/i, 'fashion'],
  [/furniture/i, 'furniture'],
  [/beauty|cosmetic|skincare/i, 'beauty'],
  [/restaurant|food|dining|cafe/i, 'restaurant'],
  [/pharmac|medicine|health/i, 'pharmacy'],
  [/auto|vehicle|car parts/i, 'automotive'],
  [/construction|material|equipment/i, 'construction'],
  [/luxury|premium/i, 'luxury'],
  [/enterprise|b2b/i, 'enterprise']
];

function pickTheme({ businessType, description, category, allowedThemes }) {
  const haystack = `${businessType || ''} ${description || ''} ${category || ''}`;
  for (const [pattern, theme] of THEME_KEYWORDS) {
    if (pattern.test(haystack) && (!allowedThemes || allowedThemes.includes(theme))) {
      return theme;
    }
  }
  if (allowedThemes && allowedThemes.length) {
    return allowedThemes.includes('retail') ? 'retail' : allowedThemes[0];
  }
  return 'retail';
}

// A sensible starter layout, filtered down to whatever blocks this
// account's role is allowed to publish (see blocksForRole).
function starterBlocks({ shopName, description, allowedBlocks }) {
  const candidates = [
    { blockType: 'hero_banner', config: { headline: shopName || 'Welcome to our shop', subheadline: description || '' } },
    { blockType: 'featured_products', config: { title: 'Featured Products' } },
    { blockType: 'about_us', config: { title: 'About Us', body: description || '' } },
    { blockType: 'wholesale_products', config: { title: 'Wholesale Products' } },
    { blockType: 'agriculture_harvest', config: { title: 'This Season\u2019s Harvest' } },
    { blockType: 'business_hours', config: { hoursText: '' } },
    { blockType: 'faq', config: { qaText: '' } },
    { blockType: 'contact_support', config: {} }
  ];

  const filtered = allowedBlocks ? candidates.filter((c) => allowedBlocks.includes(c.blockType)) : candidates;
  return filtered.map((block, position) => ({ ...block, position }));
}

export async function generateStoreDesign({ shopName, businessType, description, category, allowedThemes, allowedBlocks }) {
  const theme = pickTheme({ businessType, description, category, allowedThemes });
  const colors = THEME_COLORS[theme] || THEME_COLORS.retail;

  return {
    theme,
    colors,
    businessDescription: description || `${shopName || 'This shop'} is a ${businessType || 'growing'} business on JEDIDA Marketplace.`,
    blocks: starterBlocks({ shopName, description, allowedBlocks })
  };
}
