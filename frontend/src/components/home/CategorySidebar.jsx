import { Link } from 'react-router-dom';
import Icon from '../icons/icon';
import { CATEGORIES } from '../../constants/categories';

// Same icon map used by the category grid/strip elsewhere on the homepage —
// kept in sync so a category always renders with the same glyph everywhere.
const CATEGORY_ICONS = {
  agriculture: 'box', electronics: 'laptop', fashion: 'bag', home_and_garden: 'grid',
  health_and_beauty: 'heart', vehicles: 'truck', food_and_beverages: 'box',
  sports_and_outdoors: 'star', books_and_media: 'document', toys_and_kids: 'box',
  art_and_crafts: 'box', services: 'checkShield', other: 'grid',
};

export default function CategorySidebar({ categoryImages }) {
  return (
    <aside className="jd-cat-sidebar" aria-label="Browse categories">
      <div className="jd-cat-sidebar-head">
        <span>Top Categories</span>
        <Link to="/marketplace" className="jd-cat-sidebar-viewall">View all</Link>
      </div>
      <nav className="jd-cat-sidebar-list">
        {CATEGORIES.map((c) => {
          const liveImage = categoryImages?.[c.value];
          return (
            <Link key={c.value} to={`/marketplace?category=${c.value}`} className="jd-cat-sidebar-item">
              <span className="jd-cat-sidebar-icon">
                {liveImage ? <img src={liveImage} alt="" loading="lazy" /> : <Icon name={CATEGORY_ICONS[c.value] || 'grid'} size={16} />}
              </span>
              <span className="jd-cat-sidebar-label">{c.label}</span>
              <Icon name="chevronRight" size={14} />
            </Link>
          );
        })}
      </nav>

      <Link to="/seller/upgrade" className="jd-cat-sidebar-sell">
        <div className="jd-cat-sidebar-sell-icon">🏪</div>
        <div>
          <strong>Sell on Jedida</strong>
          <span>Reach buyers across Uganda and beyond</span>
        </div>
      </Link>
    </aside>
  );
}
