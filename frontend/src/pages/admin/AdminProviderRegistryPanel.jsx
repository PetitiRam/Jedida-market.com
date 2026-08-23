import { useEffect, useState } from 'react';
import client from '../../api/client';

const NEXT_ACTIONS = {
  pending: [{ status: 'under_review', label: 'Move to Review' }, { status: 'approved', label: 'Approve' }, { status: 'rejected', label: 'Reject' }],
  under_review: [{ status: 'approved', label: 'Approve' }, { status: 'rejected', label: 'Reject' }],
  approved: [{ status: 'active', label: 'Activate' }, { status: 'suspended', label: 'Suspend' }],
  active: [{ status: 'suspended', label: 'Suspend' }],
  suspended: [{ status: 'active', label: 'Reactivate' }, { status: 'rejected', label: 'Reject' }],
  rejected: [{ status: 'pending', label: 'Reopen' }]
};

export default function AdminProviderRegistryPanel() {
  const [providers, setProviders] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    client.get('/provider-registry/admin')
      .then(({ data }) => setProviders(data.providers))
      .catch((err) => setError(err.response?.data?.error || 'Could not load provider registry.'));
  };
  useEffect(() => { load(); }, []);

  const act = async (provider, newStatus) => {
    const reason = newStatus === 'rejected' || newStatus === 'suspended'
      ? window.prompt(`Reason for moving ${provider.name} to ${newStatus}:`) || ''
      : '';
    setBusyId(provider.id);
    try {
      await client.patch(`/provider-registry/admin/${provider.id}/status`, { newStatus, reason });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update provider status.');
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <div className="empty-state">{error}</div>;
  if (!providers) return <div className="empty-state">Loading provider registry…</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>🏦 Provider Registry</h3>
      <p style={{ color: '#5B6760', marginBottom: 16 }}>
        Approve, activate, or suspend payment providers. Sellers can only connect a provider once it's Active here —
        and it still has to be enabled in Settings Center's Payment section to actually reach buyers.
      </p>

      {providers.length === 0 ? (
        <div className="empty-state">No providers in the registry yet.</div>
      ) : (
        providers.map((p) => (
          <div key={p.id} className="card-surface" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{p.name}</strong>
                  <span className={`status-chip status-${p.status === 'active' ? 'active' : p.status === 'rejected' ? 'rejected' : 'pending_review'}`}>{p.status}</span>
                  <span style={{ fontSize: '0.72rem', color: '#8A9189', textTransform: 'uppercase' }}>{p.category}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#5B6760', marginTop: 2 }}>{p.description}</div>
                <div style={{ fontSize: '0.78rem', color: '#8A9189', marginTop: 4 }}>{p.connected_seller_count} seller{p.connected_seller_count !== '1' ? 's' : ''} connected</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(NEXT_ACTIONS[p.status] || []).map((a) => (
                  <button key={a.status} className="btn-secondary" disabled={busyId === p.id} onClick={() => act(p, a.status)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
