import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../icons/icon';
import { searchProducts } from '../../api/homeApi';

export default function AISearchBar() {
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) { setSuggestions([]); return undefined; }
    const t = setTimeout(() => {
      searchProducts(query, 6)
        .then(({ data }) => setSuggestions(data.products || []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const goToSearch = (query) => {
    const q = (query ?? term).trim();
    if (!q) return;
    setOpen(false);
    navigate(`/marketplace?search=${encodeURIComponent(q)}`);
  };

  const goToProduct = (product) => {
    setOpen(false);
    navigate(`/product/${product.id}`);
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Enter') goToSearch();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) goToProduct(suggestions[activeIndex]);
      else goToSearch();
    } else if (e.key === 'Escape') setOpen(false);
  };

  const getImage = (p) => (Array.isArray(p.images) && p.images[0]) || p.image_url || '/placeholder.png';

  return (
    <div className="ai-search" ref={boxRef}>
      <div className="ai-search-input-row">
        <Icon name="search" size={18} />
        <input
          type="text"
          placeholder="Search products, brands or shops…"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); setActiveIndex(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          aria-label="Search the marketplace"
          aria-expanded={open && suggestions.length > 0}
          role="combobox"
        />
        {term && (
          <button
            type="button"
            onClick={() => goToSearch()}
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 16px', fontSize: '0.85rem' }}
          >
            Search
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="ai-search-suggestions" role="listbox">
          {suggestions.map((p, i) => (
            <div
              key={p.id}
              role="option"
              aria-selected={activeIndex === i}
              className={`ai-suggestion-row ${activeIndex === i ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => goToProduct(p)}
            >
              <img className="ai-suggestion-thumb" src={getImage(p)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {p.currency || 'UGX'} {Number(p.price).toLocaleString()}
                  {p.shop_name ? ` · ${p.shop_name}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
