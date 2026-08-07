import { useEffect, useState } from 'react';
import client from '../../api/client';
import SecurityFaceCapture from '../../components/security/SecurityFaceCapture';

const STATUSES = ['pending_payment', 'paid_escrow', 'shipped', 'delivered_confirmed', 'completed', 'cancelled', 'disputed'];
const PAGE_SIZE = 50;

export default function AdminOrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [assignPick, setAssignPick] = useState({});
  const [pendingRefund, setPendingRefund] = useState(null); // { id, reason } while the face-capture modal is open

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/orders/all', {
        params: { status: statusFilter || undefined, search: search || undefined, page, pageSize: PAGE_SIZE }
      });
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load orders. Check your connection and try again.');
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

  const release = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await client.post(`/orders/${id}/release-funds`);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not release funds for this order.');
    } finally {
      setBusyId(null);
    }
  };

  // Admin refunds are gated behind requireFaceVerification('admin_refund')
  // on the backend — reason/confirm collects intent as before, then the
  // face-capture modal collects the live frame the gate actually checks
  // before the refund is submitted.
  const refund = (id) => {
    const reason = prompt('Reason for refund (shown to the buyer and kept in the audit log):');
    if (reason === null) return;
    if (!confirm('Refund this order to the buyer? This reverses escrow and restocks the product.')) return;
    setPendingRefund({ id, reason });
  };

  const submitRefund = async (faceCapture) => {
    const { id, reason } = pendingRefund;
    setPendingRefund(null);
    setBusyId(id);
    setError('');
    try {
      await client.post(`/orders/${id}/admin-refund`, { reason, faceCapture });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not process this refund.');
    } finally {
      setBusyId(null);
    }
  };

  const assign = async (id) => {
    const driverId = assignPick[id];
    if (!driverId) return;
    setBusyId(id);
    setError('');
    try {
      await client.post(`/orders/${id}/assign-delivery`, { deliveryPersonnelId: driverId });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not assign a delivery person to this order.');
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const REFUNDABLE = ['paid_escrow', 'shipped', 'delivered_confirmed', 'disputed'];

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
          <label>Search (order ID, buyer, shop)</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders…" />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-surface" style={{ display: 'flex', gap: 16 }}>
              <div className="skeleton" style={{ height: 16, width: '30%' }} />
              <div className="skeleton" style={{ height: 16, width: '20%' }} />
              <div className="skeleton" style={{ height: 16, width: '15%' }} />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No orders match these filters.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map((o) => (
            <div className="card-surface" key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>Order {o.id.slice(0, 8)}</strong>
                <div className="product-card-meta">
                  {o.buyer_name} ({o.buyer_email}) · {o.shop_name} · {new Date(o.created_at).toLocaleDateString()}
                </div>
                <div className="product-card-meta">{o.currency} {Number(o.total_amount).toLocaleString()} · fee {o.platform_fee_amount}</div>
              </div>
              <span className={`status-chip status-${o.status}`}>{o.status.replace(/_/g, ' ')}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={assignPick[o.id] || ''}
                  onChange={(e) => setAssignPick({ ...assignPick, [o.id]: e.target.value })}
                  style={{ maxWidth: 200 }}
                >
                  <option value="">Assign delivery…</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.user_id}>{d.full_name} ({d.phone_number || 'no phone'})</option>
                  ))}
                </select>
                <button className="btn-secondary" disabled={!assignPick[o.id] || busyId === o.id} onClick={() => assign(o.id)}>Assign</button>
                {o.status === 'completed' && (
                  <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} disabled={busyId === o.id} onClick={() => release(o.id)}>Release funds</button>
                )}
                {REFUNDABLE.includes(o.status) && (
                  <button className="btn-secondary" style={{ color: '#b42318', borderColor: '#fda29b' }} disabled={busyId === o.id} onClick={() => refund(o.id)}>Refund</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span className="product-card-meta">{total} orders total</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="product-card-meta">Page {page} of {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      </div>

      {pendingRefund && (
        <SecurityFaceCapture
          title="Verify your identity to process this refund"
          onCancel={() => setPendingRefund(null)}
          onConfirm={submitRefund}
        />
      )}
    </div>
  );
}
