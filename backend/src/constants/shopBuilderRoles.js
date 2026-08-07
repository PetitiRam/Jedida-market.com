// Shop Builder — theme & block availability by account role.
//
// NOTE: this file was not present in the uploaded shop-builder module (it
// was imported by shopBuilderController.js and ShopBuilderDashboard.jsx but
// missing from the package). Reconstructed here from the theme/block keys
// those two files already reference, and from the role set already used
// elsewhere in this app (SHARED_DASHBOARD_ROLES in SellerDashboard.jsx:
// seller, manufacturer, supplier, dropshipper, farmer). Review the mapping
// below and adjust if it doesn't match what you originally had.

export const ALL_THEMES = [
  'retail', 'wholesale', 'farm', 'brand', 'coffee_export', 'electronics',
  'fashion', 'furniture', 'beauty', 'restaurant', 'pharmacy', 'automotive',
  'construction', 'corporate', 'luxury', 'minimal', 'modern', 'dark',
  'creative', 'marketplace', 'enterprise'
];

// Themes available to every role regardless of business type.
const UNIVERSAL_THEMES = ['minimal', 'modern', 'dark', 'creative', 'marketplace', 'corporate', 'luxury'];

// Niche retail-style themes — any seller-type account moving physical or
// digital goods direct to buyers.
const RETAIL_THEMES = ['retail', 'brand', 'electronics', 'fashion', 'furniture', 'beauty', 'restaurant', 'pharmacy', 'automotive', 'construction'];

// B2B/bulk-oriented themes.
const B2B_THEMES = ['wholesale', 'enterprise'];

const THEMES_BY_ROLE = {
  seller: [...UNIVERSAL_THEMES, ...RETAIL_THEMES],
  dropshipper: [...UNIVERSAL_THEMES, ...RETAIL_THEMES],
  manufacturer: [...UNIVERSAL_THEMES, ...B2B_THEMES, 'wholesale'],
  supplier: [...UNIVERSAL_THEMES, ...B2B_THEMES],
  farmer: [...UNIVERSAL_THEMES, 'farm', 'coffee_export', 'wholesale']
};

export function themesForRole(role) {
  return THEMES_BY_ROLE[role] || UNIVERSAL_THEMES;
}

export const ALL_BLOCK_TYPES = [
  // Merchandising
  'featured_products', 'product_categories', 'product_carousel', 'collections_grid',
  'best_sellers', 'new_arrivals', 'flash_sale', 'todays_deals', 'most_popular',
  'recommended_products', 'trending_products', 'ai_recommended_products', 'bulk_deals',
  'agriculture_harvest', 'wholesale_products', 'supplier_catalog', 'manufacturer_catalog',
  'supplier_information', 'quote_request_widget',
  // Homepage & Media
  'hero_banner', 'image_slider', 'announcement_bar', 'video_section', 'video_gallery',
  'gallery', 'social_feed',
  // Story & Trust
  'about_us', 'brand_story', 'founder_story', 'company_timeline', 'mission_vision',
  'reviews', 'customer_testimonials', 'certificates_awards', 'trust_badges', 'partners_logos',
  // Info & Policies
  'faq', 'contact_support', 'map_location', 'business_hours', 'store_policies',
  'delivery_information', 'payment_methods',
  // Engagement
  'newsletter_signup', 'order_tracking_widget', 'appointment_booking', 'donation_section',
  'digital_downloads', 'job_opportunities', 'community_section', 'events_list', 'news_section'
];

// Blocks that only make sense for a B2B / bulk-selling shop.
const B2B_ONLY_BLOCKS = ['wholesale_products', 'supplier_catalog', 'manufacturer_catalog', 'supplier_information', 'quote_request_widget', 'bulk_deals'];

// Blocks that only make sense for a direct-to-consumer retail shop.
const RETAIL_ONLY_BLOCKS = ['flash_sale', 'todays_deals', 'best_sellers', 'new_arrivals', 'most_popular', 'recommended_products', 'trending_products', 'ai_recommended_products'];

const FARM_ONLY_BLOCKS = ['agriculture_harvest'];

// Every block not called out above is safe for any role (media, story,
// policies, engagement sections).
const UNIVERSAL_BLOCKS = ALL_BLOCK_TYPES.filter(
  (b) => ![...B2B_ONLY_BLOCKS, ...RETAIL_ONLY_BLOCKS, ...FARM_ONLY_BLOCKS].includes(b)
);

const BLOCKS_BY_ROLE = {
  seller: [...UNIVERSAL_BLOCKS, ...RETAIL_ONLY_BLOCKS],
  dropshipper: [...UNIVERSAL_BLOCKS, ...RETAIL_ONLY_BLOCKS],
  manufacturer: [...UNIVERSAL_BLOCKS, ...B2B_ONLY_BLOCKS],
  supplier: [...UNIVERSAL_BLOCKS, ...B2B_ONLY_BLOCKS],
  farmer: [...UNIVERSAL_BLOCKS, ...B2B_ONLY_BLOCKS, ...FARM_ONLY_BLOCKS]
};

export function blocksForRole(role) {
  return BLOCKS_BY_ROLE[role] || UNIVERSAL_BLOCKS;
}
