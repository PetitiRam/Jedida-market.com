import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import ProductCard from '../ProductCard';
import ProductCardSkeleton from './ProductCardSkeleton';
import { getRecentlyViewed } from '../../utils/recentlyViewed';

const CARD_WIDTH = 232;

// Renders one row of the Trending Products page for a given section config
// from constants/trendingSections.js. Fetches its own data based on
// `section.source` so the parent page just lays out a list of sections.
export default function TrendingSection({ section, limit = 12, seeAllHref, excludeId }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (section.source === 'local') {
      const items = getRecentlyViewed({ excludeId }).slice(0, limit);
      setProducts(items);
      setLoading(false);
      return undefined;
    }

    // 'api' and 'placeholder' sections both read from the real product feed
    client.get('/products', { params: { sort: section.sort, limit } })
      .then(({ data }) => {
        if (cancelled) return;
        const items = (data.products || []).filter((p) => p.id !== excludeId);
        setProducts(items);
      })
      .catch(() => { if (!cancelled) setProducts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [section, limit, excludeId]);

  if (!loading && products.length === 0) return null;

  return (
    <section className="trending-section">
      <div className="trending-section-head">
        <div>
          <h3>{section.label}</h3>
          {section.subtitle && <p>{section.subtitle}</p>}
        </div>
        {seeAllHref && (
          <button type="button" className="trending-see-all" onClick={() => navigate(seeAllHref)}>
            See all →
          </button>
        )}
      </div>

      <div className="trending-row">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="trending-card-slot" style={{ width: CARD_WIDTH }}>
                <ProductCardSkeleton />
              </div>
            ))
          : products.map((p) => (
              <div key={p.id} className="trending-card-slot" style={{ width: CARD_WIDTH }}>
                <ProductCard product={p} onPress={() => navigate(`/product/${p.id}`)} compact />
              </div>
            ))}
      </div>
    </section>
  );
}
