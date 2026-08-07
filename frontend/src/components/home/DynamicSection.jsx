import { Link } from 'react-router-dom';
import ProductCard from '../ProductCard';
import ShopCard from './ShopCard';
import Icon from '../icons/icon';
import { CATEGORIES } from '../../constants/categories';

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

// Renders any admin-created homepage section that isn't one of the built-in
// rails already wired to live geo/deal logic (see Marketplace.jsx). Items
// come straight from /marketplace-layout, already resolved live server-side
// — a query-backed section, a hand-curated list, or a category spotlight.
export default function DynamicSection({ section }) {
  const { title, subtitle, kind, layout, key, items } = section;
  if (!items || items.length === 0) return null;

  const gridClass = kind === 'shops' ? 'shop-grid-v2' : 'product-grid-v2';
  const wrapClass = `${gridClass}${layout === 'rail' ? ' is-rail' : ''}`;

  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2>{title}</h2>
        {subtitle && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</span>}
        <Link to={`/marketplace/section/${key}`} className="view-all">View all →</Link>
      </div>

      {kind === 'categories' ? (
        <div className="jd-shop-cat-row">
          {items.map((c) => (
            <Link key={c.category} to={`/marketplace?category=${c.category}`} className="jd-shop-cat-tile">
              <span className="jd-shop-cat-icon">
                {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <Icon name="grid" size={26} />}
              </span>
              <span className="jd-shop-cat-label">{CATEGORY_LABEL[c.category] || c.category}</span>
              {c.count > 0 && <span className="jd-shop-cat-count">{c.count} items</span>}
            </Link>
          ))}
        </div>
      ) : (
        <div className={wrapClass}>
          {items.map((item) => (
            kind === 'shops' ? <ShopCard key={item.id} shop={item} /> : <ProductCard key={item.id} product={item} />
          ))}
        </div>
      )}
    </section>
  );
}
