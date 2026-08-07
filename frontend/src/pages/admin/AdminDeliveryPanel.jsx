import { useEffect, useState } from 'react';
import client from '../../api/client';

const STATUSES = ['pending', 'confirmed', 'processing', 'packed', 'assigned_to_driver', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned'];
const PAGE_SIZE = 50;

export default function AdminDeliveryPanel() {
  const [deliveries, setDeliveries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [assignPick, setAssignPick] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/deliveries/all', {
        params: { status: statusFilter || undefined, search: search || undefined, page, pageSize: PAGE_SIZE }
      });
      setDeliveries(data.deliveries || []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load deliveries. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, page]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    client.get('/deliveries/drivers').then(({ data }) => setDrivers(data.drivers || [])).catch(() => {});
  }, []);

  const assign = async (id) => {
    const driverId = assignPick[id];
    if (!driverId) return;
    setBusyId(id);
    setError('');
    try {
      await client.post(`/deliveries/${id}/assign-driver`, { driverId });
      await load();
    } catch {
      setError('Could not assign a driver to this delivery.');
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

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div className="field-group" style={{ maxWidth: 220 }}>
          <label>Filter by status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="field-group" style={{ maxWidth: 300 }}>
          <label>Search (order ID, driver, address)</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deliveries…" />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-surface" style={{ display: 'flex', gap: 16 }}>
              <div className="skeleton" style={{ height: 16, width: '40%' }} />
              <div className="skeleton" style={{ height: 16, width: '20%' }} />
            </div>
          ))}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="empty-state">No deliveries match these filters.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {deliveries.map((d) => (
            <div className="card-surface" key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>Delivery {d.id.slice(0, 8)}</strong> · order {d.order_id.slice(0, 8)}
                <div className="product-card-meta">
                  {d.driver_name ? `${d.driver_name} (${d.driver_phone || 'no phone'})` : 'No driver assigned'} · {d.dropoff_address || 'no address on file'}
                </div>
                <div className="product-card-meta">
                  Created {new Date(d.created_at).toLocaleDateString()}{d.delivered_at ? ` · Delivered ${new Date(d.delivered_at).toLocaleDateString()}` : ''}
                </div>
              </div>
              <span className={`status-chip status-${d.status}`}>{d.status.replace(/_/g, ' ')}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={assignPick[d.id] || ''}
                  onChange={(e) => setAssignPick({ ...assignPick, [d.id]: e.target.value })}
                  style={{ maxWidth: 200 }}
                >
                  <option value="">Assign driver…</option>
                  {drivers.map((dr) => (
                    <option key={dr.id} value={dr.id}>{dr.full_name} ({dr.phone_number || 'no phone'})</option>
                  ))}
                </select>
                <button className="btn-secondary" disabled={!assignPick[d.id] || busyId === d.id} onClick={() => assign(d.id)}>Assign</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span className="product-card-meta">{total} deliveries total</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="product-card-meta">Page {page} of {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      </div>
    </div>
  );
}
