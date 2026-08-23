import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function SellerFeaturesPanel() {
  const [features, setFeatures] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);

  const load = () => {
    client.get('/feature-engine/mine')
      .then(({ data }) => setFeatures(data.features))
      .catch((err) => setError(err.response?.data?.error || 'Could not load your features.'));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (feature) => {
    setBusyKey(feature.key);
    try {
      await client.post(`/feature-engine/mine/${feature.key}/toggle`, { enabled: !feature.activated });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update this feature.');
    } finally {
      setBusyKey(null);
    }
  };

  if (error) return <div className="empty-state">{error}</div>;
  if (!features) return <div className="empty-state">Loading features…</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Features</h3>
      <p style={{ color: '#5B6760', marginBottom: 16 }}>Marketplace capabilities available to your shop.</p>

      {features.length === 0 ? (
        <div className="empty-state">No features have been registered yet.</div>
      ) : (
        features.map((f) => (
          <div key={f.key} className="card-surface" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong>{f.name}</strong>
              <div style={{ fontSize: '0.82rem', color: '#5B6760' }}>{f.description}</div>
              {!f.eligible && <div style={{ fontSize: '0.78rem', color: '#8A5A0D', marginTop: 4 }}>Not available for your seller role.</div>}
              {f.eligible && f.global_status !== 'available' && <div style={{ fontSize: '0.78rem', color: '#8A5A0D', marginTop: 4 }}>Currently {f.global_status} marketplace-wide.</div>}
            </div>
            {f.eligible && f.global_status === 'available' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`status-chip status-${f.enabled ? 'active' : 'pending_review'}`}>{f.enabled ? '● On' : 'Off'}</span>
                <button className="btn-secondary" disabled={busyKey === f.key} onClick={() => toggle(f)}>
                  {busyKey === f.key ? 'Saving…' : f.activated ? 'Turn off' : 'Turn on'}
                </button>
              </div>
            ) : (
              <span className="status-chip status-pending_review">Unavailable</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
