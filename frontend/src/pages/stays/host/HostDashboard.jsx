import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as staysApi from '../../../api/staysApi';
import { propertyTypeLabel } from '../staysConstants';
import HostNav from './HostNav';

const STATUS_LABELS = {
  draft: { label: 'Draft', color: '#8A9189' },
  pending_review: { label: 'Pending Review', color: '#B98900' },
  active: { label: 'Live', color: '#1E7A3E' },
  paused: { label: 'Paused', color: '#8A9189' },
  rejected: { label: 'Rejected', color: '#C23B3B' },
};

export default function HostDashboard() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await staysApi.myProperties();
      setProperties(data.properties || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your properties.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const togglePause = async (p) => {
    await staysApi.setPropertyVisibility(p.id, p.status === 'active');
    load();
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      await staysApi.deleteProperty(p.id);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete property.');
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <HostNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>🏡 My Stays Properties</h1>
        <button className="btn-primary" onClick={() => navigate('/host/properties/new')}>+ Add Property</button>
      </div>

      {error && <div className="apf-error-text">{error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && properties.length === 0 && (
        <div className="empty-state">You haven't listed any properties yet. Add your first one to get started.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {properties.map((p) => {
          const statusInfo = STATUS_LABELS[p.status] || { label: p.status, color: '#8A9189' };
          return (
            <div key={p.id} className="card-surface" style={{ display: 'flex', gap: 12, padding: 12, alignItems: 'center' }}>
              <div style={{
                width: 90, height: 66, borderRadius: 8, flexShrink: 0,
                background: p.cover_image ? `url(${p.cover_image}) center/cover` : '#EEF4EF',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <strong>{p.title}</strong>
                  <span style={{ fontSize: '0.72rem', color: statusInfo.color, fontWeight: 600 }}>{statusInfo.label}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>
                  {propertyTypeLabel(p.property_type)} · {p.city || 'No city set'} · {p.currency} {Number(p.base_price).toLocaleString()}/night
                </div>
                <div style={{ fontSize: '0.75rem', color: '#8A9189' }}>{p.views_count} views · {p.bookings_count} bookings</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn-secondary" onClick={() => navigate(`/host/properties/${p.id}`)}>Manage</button>
                {['active', 'paused'].includes(p.status) && (
                  <button className="btn-secondary" onClick={() => togglePause(p)}>
                    {p.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                )}
                <button className="btn-secondary" onClick={() => remove(p)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
