import { Link } from 'react-router-dom';
import ShopCard from './ShopCard';

function ShopCardSkeleton() {
  return (
    <div className="skeleton-card" style={{ background: 'var(--surface)' }}>
      <div className="skeleton" style={{ height: 96, borderRadius: 0 }} />
      <div style={{ padding: '40px 16px 16px' }}>
        <div className="skeleton skeleton-line short" style={{ margin: '0 0 10px' }} />
        <div className="skeleton skeleton-line" style={{ margin: '0 0 14px', width: '80%' }} />
        <div className="skeleton" style={{ height: 34, borderRadius: 12 }} />
      </div>
    </div>
  );
}

export default function ShopsSection({ title, viewAllHref, shops, status, onRetry }) {
  if (status === 'ready' && (!shops || shops.length === 0)) return null;

  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2>{title}</h2>
        {viewAllHref && status === 'ready' && shops?.length > 0 && (
          <Link to={viewAllHref} className="view-all">View all →</Link>
        )}
      </div>

      {status === 'loading' && (
        <div className="shop-grid-v2 is-rail">
          {Array.from({ length: 4 }).map((_, i) => <ShopCardSkeleton key={i} />)}
        </div>
      )}

      {status === 'error' && (
        <div className="section-error">
          <span>We couldn't load featured shops right now.</span>
          {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
        </div>
      )}

      {status === 'ready' && shops?.length > 0 && (
        <div className="shop-grid-v2 is-rail">
          {shops.map((s) => <ShopCard key={s.id} shop={s} />)}
        </div>
      )}
    </section>
  );
}
