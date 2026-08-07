import { useEffect, useState } from 'react';
import client from '../../api/client';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];
const PAGE_SIZE = 50;

export default function AdminShopsPanel() {
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [shops, setShops] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'pending') {
        const { data } = await client.get('/admin/shops/pending');
        setShops(data.shops || []);
        setTotal((data.shops || []).length);
      } else {
        const { data } = await client.get('/admin/shops', {
          params: { status: tab || undefined, search: search || undefined, page, pageSize: PAGE_SIZE }
        });
        setShops(data.shops || []);
        setTotal(data.total || 0);
      }
    } catch {
      setError('Could not load shops. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab, page]);
  useEffect(() => {
    if (tab === 'pending') return;
    const t = setTimeout(() => { setPage(1); load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const review = async (id, decision) => {
    let reason = '';
    if (decision === 'reject') {
      reason = prompt('Reason for rejection (sent to the seller):') || '';
      if (reason === null) return;
    }
    setBusyId(id);
    setError('');
    try {
      await client.post(`/admin/shops/${id}/review`, { decision, reason });
      await load();
    } catch {
      setError('Could not submit that review. Please retry.');
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (id, status) => {
    let reason = '';
    if (status === 'suspended') {
      reason = prompt('Reason for suspension (sent to the seller):') || '';
      if (reason === null) return;
    }
    if (!confirm(`${status === 'suspended' ? 'Suspend' : 'Reactivate'} this shop?`)) return;
    setBusyId(id);
    setError('');
    try {
      await client.patch(`/admin/shops/${id}/status`, { status, reason });
      await load();
    } catch {
      setError('Could not update this shop\u2019s status. Please retry.');
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {error && (
        <div className="card-surface" style={{ marginBottom: 12, background: '#fef3f2', border: '1px solid #fda29b', color: '#b42318', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button className="btn-link" onClick={load}>Retry</button>
        </div>
      )}

      <div className="tab-scroll" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-pill ${tab === t.key ? 'tab-pill-active' : ''}`}
            onClick={() => { setTab(t.key); setPage(1); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'pending' && (
        <div className="field-group" style={{ maxWidth: 300, marginBottom: 16 }}>
          <label>Search (shop name, owner)</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shops…" />
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-surface" style={{ display: 'flex', gap: 16 }}>
              <div className="skeleton" style={{ height: 16, width: '40%' }} />
              <div className="skeleton" style={{ height: 16, width: '20%' }} />
            </div>
          ))}
        </div>
      ) : shops.length === 0 ? (
        <div className="empty-state">{tab === 'pending' ? 'No shops awaiting approval.' : 'No shops match this view.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shops.map((s) => (
            <div className="card-surface" key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{s.name}</strong>
                {s.status && <span className={`status-chip status-${s.status}`} style={{ marginLeft: 8 }}>{s.status}</span>}
                <div className="product-card-meta">{s.primary_category?.replace('_', ' ')} · {s.description}</div>
                {s.owner_name && <div className="product-card-meta">Owner: {s.owner_name} ({s.owner_email})</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {s.status === 'pending' && (
                  <>
                    <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} disabled={busyId === s.id} onClick={() => review(s.id, 'approve')}>Approve</button>
                    <button className="btn-secondary" disabled={busyId === s.id} onClick={() => review(s.id, 'reject')}>Reject</button>
                  </>
                )}
                {s.status === 'active' && (
                  <button className="btn-secondary" style={{ color: '#b42318', borderColor: '#fda29b' }} disabled={busyId === s.id} onClick={() => setStatus(s.id, 'suspended')}>Suspend</button>
                )}
                {s.status === 'suspended' && (
                  <button className="btn-secondary" disabled={busyId === s.id} onClick={() => setStatus(s.id, 'active')}>Reactivate</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab !== 'pending' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span className="product-card-meta">{total} shops total</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="product-card-meta">Page {page} of {totalPages}</span>
            <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
