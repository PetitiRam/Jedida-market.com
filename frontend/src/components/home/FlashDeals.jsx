import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../ProductCard';
import ProductCardSkeleton from '../product/ProductCardSkeleton';
import { sectionHref } from '../../constants/homeSections';

// Countdown to the next local midnight — a real, always-accurate "deals end
// soon" clock instead of a fixed/fake duration that resets on every reload.
function useMidnightCountdown() {
  const getRemaining = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return Math.max(0, Math.floor((nextMidnight - now) / 1000));
  };
  const [remaining, setRemaining] = useState(getRemaining);
  useEffect(() => {
    const t = setInterval(() => setRemaining(getRemaining()), 1000);
    return () => clearInterval(t);
  }, []);
  const days = Math.floor(remaining / 86400);
  const hrs = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  return { days, hrs, mins, secs };
}

export default function FlashDeals({ products, status, onRetry }) {
  const { days, hrs, mins, secs } = useMidnightCountdown();
  const pad = (n) => String(n).padStart(2, '0');

  if (status === 'ready' && (!products || products.length === 0)) return null;

  return (
    <section className="home-section">
      <div className="jd-flash-head">
        <div className="jd-flash-head-title">
          <span className="jd-flash-lightning">⚡</span>
          <h2>Flash Deals</h2>
          <span className="jd-flash-head-sub">Ends in</span>
          <div className="jd-flash-countdown-inline">
            <span>{pad(days)}<small>d</small></span>
            <span>{pad(hrs)}<small>h</small></span>
            <span>{pad(mins)}<small>m</small></span>
            <span>{pad(secs)}<small>s</small></span>
          </div>
        </div>
        <Link to={sectionHref('deals')} className="view-all">View all deals →</Link>
      </div>

      {status === 'loading' && (
        <div className="jd-flash-row">
          {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      )}

      {status === 'error' && (
        <div className="section-error">
          <span>We couldn&rsquo;t load today&rsquo;s deals right now.</span>
          {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
        </div>
      )}

      {status === 'ready' && products?.length > 0 && (
        <div className="jd-flash-row">
          {products.map((p) => (
            <div key={p.id} className="jd-flash-row-slot">
              <ProductCard product={p} compact />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
