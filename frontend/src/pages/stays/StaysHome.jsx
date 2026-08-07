import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as staysApi from '../../api/staysApi';
import { PROPERTY_TYPES, propertyTypeLabel } from './staysConstants';
import TrustBadges from './TrustBadges';

export default function StaysHome() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ q: '', property_type: '', city: '', guests: '' });
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState(new Set());

  const toggleSave = async (e, propertyId) => {
    e.stopPropagation();
    try {
      const { data } = await staysApi.toggleSavedProperty(propertyId);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (data.saved) next.add(propertyId); else next.delete(propertyId);
        return next;
      });
    } catch (err) {
      if (err.response?.status === 401) navigate('/login');
    }
  };

  const load = async (params = {}) => {
    setLoading(true);
    setError('');
    try {
      const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
      const { data } = await staysApi.searchProperties(cleaned);
      setProperties(data.properties || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load stays right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSearch = (e) => {
    e.preventDefault();
    load(filters);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ marginBottom: 4 }}>🏡 Jedida Stays</h1>
      <p style={{ color: '#5B6760', marginTop: 0, marginBottom: 20 }}>
        Verified apartments, villas, lodges, and hotels — booked and paid for entirely inside Jedida.
      </p>

      <form onSubmit={onSearch} className="card-surface" style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <input
          placeholder="City or region"
          value={filters.city}
          onChange={(e) => setFilters({ ...filters, city: e.target.value })}
          style={{ flex: '1 1 160px' }}
        />
        <select
          value={filters.property_type}
          onChange={(e) => setFilters({ ...filters, property_type: e.target.value })}
          style={{ flex: '1 1 180px' }}
        >
          <option value="">Any property type</option>
          {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type="number" min="1" placeholder="Guests"
          value={filters.guests}
          onChange={(e) => setFilters({ ...filters, guests: e.target.value })}
          style={{ width: 100 }}
        />
        <input
          placeholder="Search title or description"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          style={{ flex: '2 1 220px' }}
        />
        <button type="submit" className="btn-primary">Search</button>
      </form>

      {error && <div className="apf-error-text">{error}</div>}
      {loading && <div className="empty-state">Loading stays…</div>}
      {!loading && properties.length === 0 && <div className="empty-state">No properties match your search yet.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {properties.map((p) => (
          <div
            key={p.id}
            className="card-surface"
            style={{ cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => navigate(`/stays/${p.id}`)}
          >
            <div style={{
              height: 150, background: p.cover_image ? `url(${p.cover_image}) center/cover` : '#EEF4EF',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: 8, position: 'relative',
            }}>
              {p.is_featured && (
                <span style={{ background: '#1E293B', color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: 999 }}>
                  ✨ Featured
                </span>
              )}
              <button
                onClick={(e) => toggleSave(e, p.id)}
                style={{
                  position: 'absolute', top: 8, right: 8, border: 'none', background: 'rgba(255,255,255,0.85)',
                  borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: '1rem',
                }}
              >
                {savedIds.has(p.id) ? '❤️' : '🤍'}
              </button>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: '0.72rem', color: '#8A9189', textTransform: 'uppercase' }}>
                {propertyTypeLabel(p.property_type)}
              </div>
              <strong style={{ display: 'block', margin: '2px 0 6px' }}>{p.title}</strong>
              <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>
                {p.city ? `${p.city}${p.country ? ', ' + p.country : ''}` : p.country}
                {p.avg_rating != null && <> · ★ {p.avg_rating}</>}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>
                {p.max_guests} guests · {p.bedrooms} bed{p.bedrooms === 1 ? '' : 's'} · {p.bathrooms} bath{p.bathrooms === 1 ? '' : 's'}
              </div>
              {p.trust_badges?.length > 0 && <div style={{ marginTop: 6 }}><TrustBadges badges={p.trust_badges.slice(0, 2)} size="small" /></div>}
              <div style={{ marginTop: 6, fontWeight: 700 }}>
                {p.currency} {Number(p.base_price).toLocaleString()} <span style={{ fontWeight: 400, color: '#8A9189', fontSize: '0.78rem' }}>/ night</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
