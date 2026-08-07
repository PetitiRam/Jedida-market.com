import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../icons/icon';
import { CATEGORIES } from '../../constants/categories';

// Always shows the full category list (unlike the old count-gated
// CategoryStrip) so the homepage never renders an empty row before a
// database has accumulated per-category products.
const CATEGORY_ICONS = {
  agriculture: 'box', electronics: 'laptop', fashion: 'bag', home_and_garden: 'grid',
  health_and_beauty: 'heart', vehicles: 'truck', food_and_beverages: 'box',
  sports_and_outdoors: 'star', books_and_media: 'document', toys_and_kids: 'box',
  art_and_crafts: 'box', services: 'checkShield', other: 'grid',
};

function useCountdown(hours = 50) {
  const [remaining, setRemaining] = useState(hours * 3600);
  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  const days = Math.floor(remaining / 86400);
  const hrs = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  return { days, hrs, mins, secs };
}

export default function CategoryDealsRow({ categoryCounts }) {
  const countByCategory = Object.fromEntries((categoryCounts || []).map((c) => [c.category, c.count]));
  const { days, hrs, mins, secs } = useCountdown();
  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className="jd-cat-deals-row">
      <div className="jd-cat-grid-static">
        {CATEGORIES.map((c) => (
          <Link key={c.value} to={`/marketplace?category=${c.value}`} className="jd-cat-grid-tile">
            <span className="jd-cat-grid-icon"><Icon name={CATEGORY_ICONS[c.value] || 'grid'} size={20} /></span>
            <span className="jd-cat-grid-label">{c.label}</span>
            {countByCategory[c.value] > 0 && (
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{countByCategory[c.value]} items</span>
            )}
          </Link>
        ))}
      </div>

      <div className="jd-flash-banner">
        <div>
          <div className="jd-flash-banner-title">⚡ JEDIDA Flash Deals</div>
          <div className="jd-flash-banner-sub">Big deals. Limited time! Save more on top products</div>
        </div>
        <div className="jd-flash-countdown">
          <div className="jd-flash-countdown-cell"><strong>{pad(days)}</strong><span>Days</span></div>
          <div className="jd-flash-countdown-cell"><strong>{pad(hrs)}</strong><span>Hours</span></div>
          <div className="jd-flash-countdown-cell"><strong>{pad(mins)}</strong><span>Mins</span></div>
          <div className="jd-flash-countdown-cell"><strong>{pad(secs)}</strong><span>Secs</span></div>
        </div>
        <Link to="/marketplace?sort=deals" className="jd-flash-banner-cta">Shop Deals</Link>
      </div>
    </div>
  );
}
