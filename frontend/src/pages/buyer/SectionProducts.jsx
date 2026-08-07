import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import { getPublicSection } from '../../api/marketplaceBuilder';
import useAutoLocation from '../../hooks/useAutoLocation';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import ProductCard from '../../components/ProductCard';
import ProductCardSkeleton from '../../components/product/ProductCardSkeleton';
import ShopCard from '../../components/home/ShopCard';
import { HOME_SECTIONS } from '../../constants/homeSections';

const PAGE_SIZE = 24;
// Custom/curated sections don't have real offset pagination (they're a
// bounded, admin-curated or live-ranked list) — fetch a generous ceiling
// in one shot rather than faking a "load more" that has nothing behind it.
const CUSTOM_SECTION_LIMIT = 96;

function BuiltInSection({ section, coords }) {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setPage(1); setProducts([]); }, [section]);

  useEffect(() => {
    if (section.requiresCoords && !coords) return;
    setLoading(true);
    client.get('/products', {
      params: { ...section.params, limit: PAGE_SIZE, page, lat: coords?.lat, lng: coords?.lng }
    })
      .then(({ data }) => {
        setProducts((prev) => (page === 1 ? data.products || [] : [...prev, ...(data.products || [])]));
        setHasMore(Boolean(data.pagination?.hasMore));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, page, coords]);

  const waitingForLocation = section.requiresCoords && !coords;

  return (
    <>
      <div className="home-section-head" style={{ marginBottom: 4 }}><h2>{section.title}</h2></div>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 20 }}>{section.description}</p>

      {waitingForLocation ? (
        <div className="empty-state">Turn on location access to see what's near you.</div>
      ) : (
        <>
          {loading && page === 1 ? (
            <div className="product-grid-v2">{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
          ) : products.length === 0 ? (
            <div className="empty-state">No products in this section right now.</div>
          ) : (
            <div className="product-grid-v2">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>
          )}

          {hasMore && !loading && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <button type="button" className="btn-secondary" onClick={() => setPage((p) => p + 1)}>Load more</button>
            </div>
          )}
          {loading && page > 1 && (
            <div className="product-grid-v2" style={{ marginTop: 18 }}>
              {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}

function CustomSection({ sectionKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getPublicSection(sectionKey, { limit: CUSTOM_SECTION_LIMIT })
      .then(({ data }) => setData(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [sectionKey]);

  if (notFound) {
    return (
      <div>
        <h2>Section not found</h2>
        <p><Link to="/marketplace">Back to Marketplace</Link></p>
      </div>
    );
  }

  return (
    <>
      <div className="home-section-head" style={{ marginBottom: 4 }}><h2>{data?.title || ''}</h2></div>
      {data?.subtitle && <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 20 }}>{data.subtitle}</p>}

      {loading ? (
        <div className="product-grid-v2">{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
      ) : !data?.items || data.items.length === 0 ? (
        <div className="empty-state">No items in this section right now.</div>
      ) : data.kind === 'shops' ? (
        <div className="shop-grid-v2">{data.items.map((s) => <ShopCard key={s.id} shop={s} />)}</div>
      ) : (
        <div className="product-grid-v2">{data.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      )}
    </>
  );
}

export default function SectionProducts() {
  const { key } = useParams();
  const builtIn = HOME_SECTIONS[key];
  const { coords } = useAutoLocation();

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        {builtIn ? <BuiltInSection section={builtIn} coords={coords} /> : <CustomSection sectionKey={key} />}
      </div>
    </div>
  );
}
