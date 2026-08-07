import { Link } from 'react-router-dom';
import Icon from '../icons/icon';
import { CATEGORIES } from '../../constants/categories';

// Maps each category value to a purposeful icon (not decorative) — falls
// back to a generic tag icon for any category not in this map.
const CATEGORY_ICONS = {
  agriculture: 'box',
  electronics: 'laptop',
  fashion: 'bag',
  home_and_garden: 'grid',
  health_and_beauty: 'heart',
  vehicles: 'truck',
  food_and_beverages: 'box',
  sports_and_outdoors: 'star',
  books_and_media: 'document',
  toys_and_kids: 'box',
  art_and_crafts: 'box',
  services: 'checkShield',
  other: 'grid'
};

export default function CategoryStrip({ categoryCounts }) {
  if (!categoryCounts || categoryCounts.length === 0) return null;

  const countByCategory = Object.fromEntries(categoryCounts.map((c) => [c.category, c.count]));
  // Only show categories that actually have at least one active product,
  // ordered by how many products they have.
  const tiles = CATEGORIES
    .filter((c) => countByCategory[c.value] > 0)
    .sort((a, b) => (countByCategory[b.value] || 0) - (countByCategory[a.value] || 0));

  if (tiles.length === 0) return null;

  return (
    <div className="category-strip">
      <div className="category-scroll">
        {tiles.map((cat) => (
          <Link key={cat.value} to={`/marketplace?category=${cat.value}`} className="category-tile">
            <div className="category-tile-icon">
              <Icon name={CATEGORY_ICONS[cat.value] || 'grid'} size={20} />
            </div>
            <span className="category-tile-label">{cat.label}</span>
            <span className="category-tile-count">{countByCategory[cat.value]} items</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
