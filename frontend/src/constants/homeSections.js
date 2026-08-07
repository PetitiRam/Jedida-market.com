// Single source of truth for every curated homepage product rail. Each
// entry maps a section key (used in the "View all" URL) to the live query
// params that reproduce that exact section against /products — so a
// "View all" page always shows precisely what was in the rail, never a
// hand-written duplicate list.
export const HOME_SECTIONS = {
  featured: {
    title: 'Featured Products',
    description: 'Hand-picked listings currently featured across the marketplace.',
    params: { sort: 'featured', featuredOnly: 'true' }
  },
  trending: {
    title: 'Trending Products',
    description: "What's trending across the marketplace right now.",
    params: { sort: 'trending', trendingOnly: 'true' }
  },
  new: {
    title: 'New Arrivals',
    description: 'The newest listings added to the marketplace.',
    params: { sort: 'newest' }
  },
  deals: {
    title: 'Flash Deals',
    description: 'Every active listing currently discounted below its original price.',
    params: { sort: 'deals', dealsOnly: 'true' }
  },
  recommended: {
    title: 'Recommended For You',
    description: 'Popular picks based on orders and views across the marketplace.',
    params: { sort: 'high_demand' }
  },
  nearby: {
    title: 'Near You',
    description: 'Listings from sellers closest to your current location.',
    params: { sort: 'nearest' },
    requiresCoords: true
  }
};

export function sectionHref(key) {
  return `/marketplace/section/${key}`;
}
