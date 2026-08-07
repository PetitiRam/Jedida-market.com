import { Link } from 'react-router-dom';
import ProductCard from '../ProductCard';
import ProductCardSkeleton from '../product/ProductCardSkeleton';
import { sectionHref } from '../../constants/homeSections';

// sectionKey ties this rail to an entry in HOME_SECTIONS so "View all"
// always lands on a page showing exactly this curated set — pass an
// explicit viewAllHref only to override that (e.g. Trending's dedicated page).
export default function ProductSection({ title, viewAllHref, sectionKey, products, status, onRetry }) {
  if (status === 'ready' && (!products || products.length === 0)) return null;
  const resolvedHref = viewAllHref || (sectionKey ? sectionHref(sectionKey) : null);

  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2>{title}</h2>
        {resolvedHref && status === 'ready' && products?.length > 0 && (
          <Link to={resolvedHref} className="view-all">View all →</Link>
        )}
      </div>

      {status === 'loading' && (
        <div className="product-grid-v2 is-rail">
          {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      )}

      {status === 'error' && (
        <div className="section-error">
          <span>We couldn't load {title.toLowerCase()} right now.</span>
          {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
        </div>
      )}

      {status === 'ready' && products?.length > 0 && (
        <div className="product-grid-v2 is-rail">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </section>
  );
}
