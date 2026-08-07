import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as staysApi from '../../api/staysApi';
import { propertyTypeLabel } from './staysConstants';
import GuestNav from './GuestNav';

export default function SavedProperties() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await staysApi.listSavedProperties();
      setProperties(data.properties || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load saved properties.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const unsave = async (id) => {
    await staysApi.toggleSavedProperty(id);
    load();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1>🧳 My Stays</h1>
      <GuestNav />
      {error && <div className="apf-error-text">{error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && properties.length === 0 && <div className="empty-state">Nothing saved yet — tap the heart on a property to save it here.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {properties.map((p) => (
          <div key={p.id} className="card-surface" style={{ overflow: 'hidden' }}>
            <div
              style={{ height: 130, cursor: 'pointer', background: p.cover_image ? `url(${p.cover_image}) center/cover` : '#EEF4EF' }}
              onClick={() => navigate(`/stays/${p.id}`)}
            />
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: '0.72rem', color: '#8A9189', textTransform: 'uppercase' }}>{propertyTypeLabel(p.property_type)}</div>
              <strong>{p.title}</strong>
              <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>{p.city}{p.country ? `, ${p.country}` : ''}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontWeight: 700 }}>{p.currency} {Number(p.base_price).toLocaleString()}</span>
                <button className="btn-secondary" onClick={() => unsave(p.id)}>💔 Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
