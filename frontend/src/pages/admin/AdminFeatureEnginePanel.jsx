import { useEffect, useState } from 'react';
import client from '../../api/client';

const STATUS_OPTIONS = ['available', 'disabled', 'maintenance'];

function EligibilityEditor({ feature, onSaved }) {
  const [value, setValue] = useState((feature.eligible_roles || []).join(', '));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const roles = value.split(',').map((r) => r.trim()).filter(Boolean);
      await client.patch(`/feature-engine/admin/${feature.key}/eligibility`, { eligibleRoles: roles });
      onSaved();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update eligibility.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <input
        style={{ flex: 1, minWidth: 200 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Eligible roles, comma-separated — empty means every role"
      />
      <button className="btn-secondary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save eligibility'}</button>
    </div>
  );
}

export default function AdminFeatureEnginePanel() {
  const [features, setFeatures] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [editingKey, setEditingKey] = useState(null);

  const load = () => {
    client.get('/feature-engine/admin')
      .then(({ data }) => setFeatures(data.features))
      .catch((err) => setError(err.response?.data?.error || 'Could not load features.'));
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (feature, newStatus) => {
    const reason = newStatus !== 'available' ? (window.prompt(`Reason for setting ${feature.name} to ${newStatus}:`) || '') : '';
    setBusyKey(feature.key);
    try {
      await client.patch(`/feature-engine/admin/${feature.key}/status`, { newStatus, reason });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update feature status.');
    } finally {
      setBusyKey(null);
    }
  };

  if (error) return <div className="empty-state">{error}</div>;
  if (!features) return <div className="empty-state">Loading feature control center…</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>⚙️ Feature Control Center</h3>
      <p style={{ color: '#5B6760', marginBottom: 16 }}>
        Global on/off for marketplace capabilities. A feature also needs the seller's role to be eligible, and the
        seller to have it switched on for their own shop, before it's actually usable — see each shop's own Features
        panel for that layer.
      </p>

      {features.length === 0 ? (
        <div className="empty-state">No features registered yet.</div>
      ) : (
        features.map((f) => (
          <div key={f.key} className="card-surface" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{f.name}</strong>
                  <span className={`status-chip status-${f.global_status === 'available' ? 'active' : f.global_status === 'disabled' ? 'rejected' : 'pending_review'}`}>{f.global_status}</span>
                  {f.category && <span style={{ fontSize: '0.72rem', color: '#8A9189', textTransform: 'uppercase' }}>{f.category}</span>}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#5B6760', marginTop: 2 }}>{f.description}</div>
                <div style={{ fontSize: '0.78rem', color: '#8A9189', marginTop: 4 }}>
                  Eligible roles: {f.eligible_roles.length > 0 ? f.eligible_roles.join(', ') : 'all roles'} · {f.activated_seller_count} shop{f.activated_seller_count !== '1' ? 's' : ''} activated
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.filter((s) => s !== f.global_status).map((s) => (
                  <button key={s} className="btn-secondary" disabled={busyKey === f.key} onClick={() => setStatus(f, s)}>
                    {s === 'available' ? 'Enable' : s === 'disabled' ? 'Disable' : 'Maintenance'}
                  </button>
                ))}
                <button className="btn-secondary" onClick={() => setEditingKey((k) => (k === f.key ? null : f.key))}>
                  {editingKey === f.key ? 'Close' : 'Edit eligibility'}
                </button>
              </div>
            </div>
            {editingKey === f.key && <EligibilityEditor feature={f} onSaved={() => { load(); setEditingKey(null); }} />}
          </div>
        ))
      )}
    </div>
  );
}
