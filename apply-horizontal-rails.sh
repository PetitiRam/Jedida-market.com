#!/usr/bin/env bash
# Makes admin-created homepage product/shop sections always scroll
# horizontally on mobile, matching every other homepage rail (Flash Deals,
# Featured, Trending, New Arrivals, Featured Shops) — they only did this
# before if an admin had manually set layout:'rail' on that section.
# Everything else was already correct: full "Browse Everything" / category
# / shop-page listings already stay as vertical grids on purpose, and
# every other rail already scrolled horizontally on mobile.
set -e
if [ ! -d backend ] || [ ! -d frontend ]; then
  echo "ERROR: run this from the project root."
  exit 1
fi
cp frontend/src/components/home/DynamicSection.jsx frontend/src/components/home/DynamicSection.jsx.backup
echo "Backup created."

echo '== Writing frontend/src/components/home/DynamicSection.jsx =='
cat > frontend/src/components/home/DynamicSection.jsx <<'JEDIDA_EOF_DYNSEC'
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
//
// This component only ever appears inside the curated rails area of the
// home page (never on a full listing page like "Browse Everything" or a
// category page — those use their own vertical grid, unaffected by this).
// So on mobile it always scrolls horizontally like every sibling rail
// (Flash Deals, Trending, Featured, New Arrivals, Featured Shops) instead
// of only when an admin happened to set layout:'rail' on this specific
// section — a product/shop row here is never meant to be an exhaustive
// vertical list.
export default function DynamicSection({ section }) {
  const { title, subtitle, kind, key, items } = section;
  if (!items || items.length === 0) return null;

  const gridClass = kind === 'shops' ? 'shop-grid-v2' : 'product-grid-v2';
  const wrapClass = `${gridClass} is-rail`;

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
JEDIDA_EOF_DYNSEC

echo "Done. Restart your frontend dev server and check the home page on a"
echo "narrow (phone-width) browser window — every curated section should"
echo "now scroll sideways, while 'Browse Everything' at the bottom, and any"
echo "category/section 'View all' page, stay as a normal vertical grid."
