import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { getHomeFeed } from '../../api/homeApi';
import { getMarketplaceLayout } from '../../api/marketplaceBuilder';
import DynamicSection from '../../components/home/DynamicSection';
import useAutoLocation from '../../hooks/useAutoLocation';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import TabBar from '../../components/TabBar';
import ProductCard from '../../components/ProductCard';
import ProductCardSkeleton from '../../components/product/ProductCardSkeleton';
import HeroBanner from '../../components/home/HeroBanner';
import CategorySidebar from '../../components/home/CategorySidebar';
import RightRail from '../../components/home/RightRail';
import TrustStrip from '../../components/home/TrustStrip';
import CategoryIconRow from '../../components/home/CategoryIconRow';
import FlashDeals from '../../components/home/FlashDeals';
import BottomBannerGrid from '../../components/home/BottomBannerGrid';
import DealsStrip from '../../components/home/DealsStrip';
import ProductSection from '../../components/home/ProductSection';
import ShopsSection from '../../components/home/ShopsSection';
import DiscoveryFeedSection from '../../components/home/DiscoveryFeedSection';
import PromoCardsRow from '../../components/home/PromoCardsRow';
import { CATEGORIES } from '../../constants/categories';

function ProductGrid({ products }) {
  if (products.length === 0) return <div className="empty-state">No products found.</div>;
  return (
    <div className="product-grid-v2">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

function AllProductsTab({ coords }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // The moment coordinates resolve, quietly switch to nearest-first —
  // but only if the person hasn't already picked a sort themselves
  // (nothing here is a manual "set location" step, just respecting an
  // explicit choice once one's been made).
  useEffect(() => {
    if (coords && !searchParams.get('sort') && sort === 'newest') {
      setSort('nearest');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  useEffect(() => {
    setLoading(true);
    client.get('/products', {
      params: {
        category: category || undefined,
        sort,
        search: search || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      }
    })
      .then(({ data }) => setProducts(data.products || []))
      .finally(() => setLoading(false));
  }, [category, sort, search, coords]);

  const updateCategory = (value) => {
    setCategory(value);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('category', value); else next.delete('category');
      return next;
    });
  };

  const updateSort = (value) => {
    setSort(value);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sort', value);
      return next;
    });
  };

  return (
    <div>
      {search && (
        <div className="products-active-filter-chip">
          <span>Showing results for <strong>&ldquo;{search}&rdquo;</strong></span>
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { setSearch(''); setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('search'); return n; }); }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="products-toolbar">
        <div className="products-toolbar-row" style={{ marginBottom: 14 }}>
          <span className="products-toolbar-count">
            {loading ? 'Loading products…' : `${products.length} product${products.length === 1 ? '' : 's'}`}
          </span>
          <select
            className="products-sort-select"
            value={sort}
            onChange={(e) => updateSort(e.target.value)}
            aria-label="Sort by"
          >
            <option value="newest">Newest</option>
            {coords && <option value="nearest">Nearest to me</option>}
            <option value="trending">Trending</option>
            <option value="popular">Most popular</option>
            <option value="high_demand">High demand</option>
            <option value="deals">Biggest deals</option>
            <option value="price_low">Price: low to high</option>
            <option value="price_high">Price: high to low</option>
          </select>
        </div>

        <div className="products-chip-scroll" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`products-chip${category === '' ? ' is-active' : ''}`}
            onClick={() => updateCategory('')}
          >
            All categories
          </button>
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.value}
              className={`products-chip${category === c.value ? ' is-active' : ''}`}
              onClick={() => updateCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="product-grid-v2">{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
      ) : <ProductGrid products={products} />}
    </div>
  );
}

function ShopsTab() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { client.get('/shops').then(({ data }) => setShops(data.shops || [])).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="empty-state">Loading shops…</div>;
  if (shops.length === 0) return <div className="empty-state">No shops yet.</div>;
  return (
    <div className="product-grid-v2">
      {shops.map((s) => (
        <Link to={`/s/${s.slug}`} key={s.id} className="product-card-v2" style={{ padding: 16, textAlign: 'center', alignItems: 'center', display: 'flex', flexDirection: 'column' }}>
          {s.logo_url ? <img src={s.logo_url} alt={s.name} loading="lazy" style={{ width: 56, height: 56, borderRadius: 12, marginBottom: 8, objectFit: 'cover' }} /> : null}
          <strong>{s.name}</strong>
          <span className="product-card-meta">{s.primary_category?.replace('_', ' ')}</span>
        </Link>
      ))}
    </div>
  );
}

function AgricultureTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { client.get('/products/agriculture').then(({ data }) => setProducts(data.products || [])).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="product-grid-v2">{Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>;
  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
        Agriculture is the backbone of our economy — fresh produce and farm goods straight from sellers.
      </p>
      <ProductGrid products={products} />
    </div>
  );
}

const TABS = [
  { key: 'all', label: 'All Products' },
  { key: 'shops', label: 'Shops' },
  { key: 'agriculture', label: 'Agriculture' }
];

export default function Marketplace() {
  const [feed, setFeed] = useState(null);
  const [feedStatus, setFeedStatus] = useState('loading'); // loading | ready | error
  const [searchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.key === searchParams.get('view')) ? searchParams.get('view') : 'all';
  const { coords } = useAutoLocation();

  const loadFeed = useCallback(() => {
    // Only show the full-page skeleton on the very first load. Once the
    // page already has content, a later refetch (triggered by geolocation
    // resolving) fills in "Near You" quietly instead of re-flashing
    // every section back to a loading state.
    setFeedStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    getHomeFeed(coords)
      .then(({ data }) => { setFeed(data); setFeedStatus('ready'); })
      .catch(() => setFeedStatus((prev) => (prev === 'ready' ? prev : 'error')));
  }, [coords]);

  // Fetches on mount (no coords yet), then again the instant the browser's
  // Geolocation API resolves — never a manual re-search.
  useEffect(() => { loadFeed(); }, [loadFeed]);

  // The Marketplace Builder's resolved, ordered, currently-live layout —
  // controls which rails show, in what order, and any admin-added custom
  // sections. Falls back to the original fixed order below while this is
  // still loading, so the page never flashes empty.
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    getMarketplaceLayout().then(({ data }) => setLayout(data.sections || [])).catch(() => {});
  }, []);

  const KNOWN_RAILS = {
    nearby: (s) => <ProductSection title={s.title} sectionKey="nearby" products={feed?.nearbyProducts} status={feedStatus} onRetry={loadFeed} />,
    featured: (s) => <ProductSection title={s.title} sectionKey="featured" products={feed?.featuredProducts} status={feedStatus} onRetry={loadFeed} />,
    trending: (s) => <ProductSection title={s.title} sectionKey="trending" products={feed?.trendingProducts} status={feedStatus} onRetry={loadFeed} />,
    new: (s) => <ProductSection title={s.title} sectionKey="new" products={feed?.newArrivals} status={feedStatus} onRetry={loadFeed} />,
    deals: () => <FlashDeals products={feed?.dealProducts} status={feedStatus} onRetry={loadFeed} />,
    recommended: (s) => <ProductSection title={s.title} sectionKey="recommended" products={feed?.recommendedProducts} status={feedStatus} onRetry={loadFeed} />,
    shops_featured: (s) => <ShopsSection title={s.title} viewAllHref="/marketplace?view=shops" shops={feed?.featuredShops} status={feedStatus} onRetry={loadFeed} />,
  };
  // Same seven rails, same order, used only until the builder's layout
  // finishes its first fetch (or if that request fails outright).
  const FALLBACK_SECTIONS = [
    { key: 'deals', title: 'Flash Deals' },
    { key: 'nearby', title: 'Near You' },
    { key: 'featured', title: 'Featured Products' },
    { key: 'trending', title: 'Trending Products' },
    { key: 'new', title: 'New Arrivals' },
    { key: 'recommended', title: 'Recommended For You' },
    { key: 'shops_featured', title: 'Featured Shops' },
  ];
  const orderedSections = layout && layout.length > 0 ? layout : FALLBACK_SECTIONS;

  return (
    <div>
      <MarketplaceHeader />

      {feedStatus === 'error' && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '1rem', padding: '0.75rem 1.25rem', background: '#FDEEEE',
            borderBottom: '1px solid #F3C6C6', color: '#7A1F1F', fontSize: '0.9rem',
          }}
        >
          <span>Some parts of the homepage couldn&rsquo;t load just now. Anything already shown below is still up to date.</span>
          <button
            type="button"
            onClick={loadFeed}
            style={{ border: 'none', background: 'transparent', color: '#7A1F1F', fontWeight: 700, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="jd-mkt-top">
        <CategorySidebar categoryImages={feed?.categoryImages} />

        <div className="jd-mkt-top-main">
          {feed?.hero?.length > 0 ? (
            <HeroBanner banners={feed.hero} />
          ) : (
            <div className="hero-shell">
              <div className="hero-banner hero-banner-placeholder-free">
                <div className="hero-banner-content">
                  <span className="hero-badge">Uganda&rsquo;s Trusted Marketplace</span>
                  <h1>Top Deals. Unbeatable Prices.</h1>
                  <p>Discover amazing products from trusted sellers across Uganda.</p>
                  <Link to="/marketplace" className="hero-cta">Shop Now</Link>
                </div>
              </div>
            </div>
          )}
          <div className="jd-trust-strip-shell">
            <TrustStrip />
          </div>
        </div>

        <RightRail stats={feed?.stats} brands={feed?.popularBrands} />
      </div>

      <DealsStrip dealBanners={feed?.dealBanners} />

      <CategoryIconRow categoryCounts={feed?.categoryCounts} categoryImages={feed?.categoryImages} />

      {orderedSections.map((section) => (
        <div key={section.key}>
          {KNOWN_RAILS[section.key] ? KNOWN_RAILS[section.key](section) : <DynamicSection section={section} />}
        </div>
      ))}

      <PromoCardsRow />

      <DiscoveryFeedSection />

      <BottomBannerGrid />

      <div className="home-section">
        <div className="home-section-head">
          <h2>Browse Everything</h2>
        </div>
        <TabBar tabs={TABS} initial={initialTab}>
          {(active) => (
            <>
              {active === 'all' && <AllProductsTab coords={coords} />}
              {active === 'shops' && <ShopsTab />}
              {active === 'agriculture' && <AgricultureTab />}
            </>
          )}
        </TabBar>
      </div>
    </div>
  );
}
