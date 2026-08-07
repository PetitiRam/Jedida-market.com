import { Link } from 'react-router-dom';
import Icon from '../icons/icon';
import { CATEGORIES } from '../../constants/categories';

const CATEGORY_ICONS = {
  agriculture: 'box', electronics: 'laptop', fashion: 'bag', home_and_garden: 'grid',
  health_and_beauty: 'heart', vehicles: 'truck', food_and_beverages: 'box',
  sports_and_outdoors: 'star', books_and_media: 'document', toys_and_kids: 'box',
  art_and_crafts: 'box', services: 'checkShield', other: 'grid',
};

export default function CategoryIconRow({ categoryCounts, categoryImages }) {
  const countByCategory = Object.fromEntries((categoryCounts || []).map((c) => [c.category, c.count]));

  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2>Shop by Category</h2>
        <Link to="/marketplace" className="view-all">View all →</Link>
      </div>
      <div className="jd-shop-cat-row">
        {CATEGORIES.map((c) => {
          const liveImage = categoryImages?.[c.value];
          return (
            <Link key={c.value} to={`/marketplace?category=${c.value}`} className="jd-shop-cat-tile">
              <span className="jd-shop-cat-icon">
                {liveImage ? (
                  <>
                    <img src={liveImage} alt="" loading="lazy" />
                    <span className="jd-shop-cat-icon-badge"><Icon name={CATEGORY_ICONS[c.value] || 'grid'} size={11} /></span>
                  </>
                ) : (
                  <Icon name={CATEGORY_ICONS[c.value] || 'grid'} size={26} />
                )}
              </span>
              <span className="jd-shop-cat-label">{c.label}</span>
              {countByCategory[c.value] > 0 && (
                <span className="jd-shop-cat-count">{countByCategory[c.value]} items</span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
