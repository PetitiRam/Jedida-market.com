import { useNavigate } from 'react-router-dom';
import DropdownShell from './DropdownShell';
import RippleIconButton from './RippleIconButton';
import Icon from '../icons/icon';
import { CATEGORIES } from '../../constants/categories';

// A little glyph per category so the grid reads at a glance instead of as
// a plain text list — kept to the icon set already used across the app.
const GLYPH = {
  agriculture: '🌾', electronics: '💡', fashion: '👗', home_and_garden: '🏡',
  health_and_beauty: '💊', vehicles: '🚚', food_and_beverages: '🍽️',
  sports_and_outdoors: '🏀', books_and_media: '📚', toys_and_kids: '🧸',
  art_and_crafts: '🎨', services: '🛠️', other: '🗂️'
};

export default function CategoriesMenu() {
  const navigate = useNavigate();

  return (
    <DropdownShell
      align="left"
      width={420}
      trigger={({ open, toggle }) => (
        <RippleIconButton label="Browse categories" active={open} onClick={toggle} className="jd-nav-trigger">
          <Icon name="grid" size={18} />
          <span className="jd-nav-trigger-label">Categories</span>
          <Icon name="chevronDown" size={14} className={`jd-chevron ${open ? 'is-open' : ''}`} />
        </RippleIconButton>
      )}
    >
      {({ close }) => (
        <div className="jd-cat-grid">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className="jd-cat-tile"
              onClick={() => { close(); navigate(`/marketplace?category=${c.value}`); }}
            >
              <span className="jd-cat-tile-glyph">{GLYPH[c.value] || '🗂️'}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </DropdownShell>
  );
}
