// Section definitions for the Trending Products page.
//
// `source: 'api'` sections map straight onto the existing GET /products
// sort options already implemented in productsController.browseProducts —
// no backend changes required.
//
// `source: 'local'` sections are populated on the client from data we
// collect ourselves (see utils/recentlyViewed.js) because there is no
// backend endpoint for them yet.
//
// `source: 'placeholder'` is used where the spec asks for something
// (AI recommendations) that Tausi AI doesn't produce yet. It falls back to
// an existing sort so the section still shows real products, and is
// clearly flagged here rather than faked.

export const TRENDING_SECTIONS = [
  {
    key: 'trending',
    label: 'Trending Now',
    subtitle: 'What buyers are looking at right now',
    source: 'api',
    sort: 'trending',
  },
  {
    key: 'best_selling',
    label: 'Best Selling',
    subtitle: 'Most ordered products',
    source: 'api',
    sort: 'popular', // backend's "popular" is orders_count DESC — i.e. best sellers
  },
  {
    key: 'high_demand',
    label: 'High Demand',
    subtitle: 'Selling fast and viewed often',
    source: 'api',
    sort: 'high_demand',
  },
  {
    key: 'recently_added',
    label: 'Recently Added',
    subtitle: 'New listings from our sellers',
    source: 'api',
    sort: 'newest',
  },
  {
    key: 'recently_viewed',
    label: 'Recently Viewed',
    subtitle: 'Pick up where you left off',
    source: 'local',
  },
  {
    key: 'recommended',
    label: 'Recommended For You',
    subtitle: 'Picked based on what\u2019s trending',
    source: 'placeholder',
    sort: 'trending', // stand-in until Tausi AI recommendations ship
  },
];
