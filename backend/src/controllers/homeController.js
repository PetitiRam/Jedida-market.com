import { query } from '../config/db.js';
import { distanceKmExpr, parseCoords } from '../utils/geo.js';
import { cached } from '../utils/cache.js';

// Powers the redesigned homepage with a single call: hero/deal banners,
// live platform stats, category counts, and every dynamic product/shop
// section. Every field is computed from real data — sections the frontend
// should hide simply come back as empty arrays / null, never fake filler.
export async function getHomeFeed(req, res) {
  try {
    // Buyer's coordinates, captured silently by the browser's Geolocation
    // API the moment the marketplace loads — never a manual location
    // picker. When present, "Near You" becomes a real, sorted section;
    // when absent (permission denied, unsupported browser), it's simply
    // omitted and the rest of the feed is unaffected.
    const coords = parseCoords(req.query.lat, req.query.lng);

    // Everything below except "nearby" is identical for every visitor at
    // a given moment — previously re-run in full on every single homepage
    // load. Cached for 20s (short enough that a new listing or an admin
    // banner change shows up almost immediately) so the 10 queries below
    // run roughly once per 20s instead of once per request.
    const sharedFeed = await cached('home_feed_shared', 20_000, async () => {
      const labels = [
        'heroAds', 'dealAds', 'featuredProducts', 'trendingProducts', 'newArrivals', 'dealProducts',
        'recommendedProducts', 'featuredShops', 'stats', 'categoryCounts', 'categoryImages', 'popularBrands'
      ];
      const settled = await Promise.allSettled([
        query(
          `SELECT id, title, subtitle, image_url, video_url, link_url, cta_text, badge_text, target_category,
                  media_type, autoplay, muted, loop_video, duration_seconds, thumbnail_url
           FROM ads WHERE active = TRUE AND placement = 'hero'
             AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())
           ORDER BY priority DESC, created_at DESC LIMIT 8`
        ),
        query(
          `SELECT id, title, subtitle, image_url, video_url, link_url, cta_text, badge_text, target_category,
                  media_type, autoplay, muted, loop_video, duration_seconds, thumbnail_url
           FROM ads WHERE active = TRUE AND placement = 'deals'
             AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())
           ORDER BY priority DESC, created_at DESC LIMIT 4`
        ),
        query(
          `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status
           FROM products p JOIN shops s ON s.id = p.shop_id
           WHERE p.status = 'active' AND p.is_featured = TRUE
           ORDER BY p.created_at DESC LIMIT 12`
        ),
        query(
          `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status
           FROM products p JOIN shops s ON s.id = p.shop_id
           WHERE p.status = 'active' AND p.is_trending = TRUE
           ORDER BY p.views_count DESC LIMIT 12`
        ),
        query(
          `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status
           FROM products p JOIN shops s ON s.id = p.shop_id
           WHERE p.status = 'active'
           ORDER BY p.created_at DESC LIMIT 12`
        ),
        query(
          `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status
           FROM products p JOIN shops s ON s.id = p.shop_id
           WHERE p.status = 'active' AND p.original_price > p.price
           ORDER BY (p.original_price - p.price) DESC LIMIT 12`
        ),
        query(
          `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status
           FROM products p JOIN shops s ON s.id = p.shop_id
           WHERE p.status = 'active'
           ORDER BY p.orders_count DESC, p.views_count DESC LIMIT 12`
        ),
        query(
          `SELECT s.id, s.name, s.slug, s.logo_url, s.banner_url, s.primary_category, s.status,
                  COALESCE(AVG(r.rating), 0) AS rating,
                  COUNT(DISTINCT r.id) AS review_count,
                  COUNT(DISTINCT f.user_id) AS follower_count,
                  COUNT(DISTINCT p.id) AS product_count
           FROM shops s
           JOIN products p ON p.shop_id = s.id AND p.status = 'active'
           LEFT JOIN product_reviews r ON r.product_id = p.id
           LEFT JOIN shop_follows f ON f.shop_id = s.id
           WHERE s.status = 'active'
           GROUP BY s.id
           ORDER BY rating DESC, follower_count DESC LIMIT 8`
        ),
        query(
          `SELECT
             (SELECT COUNT(*) FROM products WHERE status = 'active') AS products,
             (SELECT COUNT(*) FROM shops WHERE status = 'active') AS sellers,
             (SELECT COUNT(*) FROM users WHERE primary_role = 'buyer') AS customers,
             (SELECT COUNT(DISTINCT location_country) FROM products WHERE status = 'active' AND location_country IS NOT NULL) AS countries`
        ),
        query(
          `SELECT category, COUNT(*) AS count FROM products WHERE status = 'active' GROUP BY category ORDER BY count DESC`
        ),
        // One real, recent product photo per category — picked live from
        // whatever's actually listed right now, never a fixed/uploaded
        // "category icon" asset. Falls back to nothing (frontend shows a
        // glyph) if a category has no photographed listings yet.
        query(
          `SELECT DISTINCT ON (category) category, images[1] AS image_url
           FROM products
           WHERE status = 'active' AND array_length(images, 1) > 0
           ORDER BY category, is_featured DESC, orders_count DESC, created_at DESC`
        ),
        // Real, currently-listed brands, ranked by how many active listings
        // carry that name — replaces what used to be a fixed guess-list of
        // brand names in the frontend. A brand with zero current listings
        // simply falls out of this list on its own.
        query(
          `SELECT brand, COUNT(*) AS product_count
           FROM products
           WHERE status = 'active' AND brand IS NOT NULL AND brand != ''
           GROUP BY brand
           ORDER BY product_count DESC, brand ASC
           LIMIT 8`
        )
      ]);

      settled.forEach((s, i) => {
        if (s.status === 'rejected') {
          console.error(`Home feed: section "${labels[i]}" failed, showing it empty:`, s.reason?.message || s.reason);
        }
      });
      const emptyRows = { rows: [] };
      const [
        heroAds, dealAds, featuredProducts, trendingProducts, newArrivals, dealProducts,
        recommendedProducts, featuredShops, stats, categoryCounts, categoryImages, popularBrands
      ] = settled.map((s) => (s.status === 'fulfilled' ? s.value : emptyRows));

      return {
        hero: heroAds.rows,
        dealBanners: dealAds.rows,
        featuredProducts: featuredProducts.rows,
        trendingProducts: trendingProducts.rows,
        newArrivals: newArrivals.rows,
        dealProducts: dealProducts.rows,
        recommendedProducts: recommendedProducts.rows,
        featuredShops: featuredShops.rows,
        stats: {
          products: Number(stats.rows[0]?.products || 0),
          sellers: Number(stats.rows[0]?.sellers || 0),
          customers: Number(stats.rows[0]?.customers || 0),
          countries: Number(stats.rows[0]?.countries || 0)
        },
        categoryCounts: categoryCounts.rows.map((r) => ({ category: r.category, count: Number(r.count) })),
        categoryImages: Object.fromEntries(categoryImages.rows.map((r) => [r.category, r.image_url])),
        popularBrands: popularBrands.rows.map((r) => r.brand)
      };
    });

    // Genuinely personalized to the visitor, so it's never cached — this
    // is a single indexed query, cheap enough to run live every request.
    const nearbyProducts = coords
      ? await query(
          `SELECT p.*, s.name AS shop_name, s.slug AS shop_slug, s.status AS shop_status,
                  ${distanceKmExpr(1, 2)} AS distance_km
           FROM products p JOIN shops s ON s.id = p.shop_id
           WHERE p.status = 'active' AND s.location_lat IS NOT NULL AND s.location_lng IS NOT NULL
           ORDER BY distance_km ASC LIMIT 12`,
          [coords.lat, coords.lng]
        )
      : { rows: [] };

    res.json({ ...sharedFeed, nearbyProducts: nearbyProducts.rows });
  } catch (err) {
    console.error('Home feed error:', err);
    res.status(500).json({ error: 'Could not load the homepage.' });
  }
}
