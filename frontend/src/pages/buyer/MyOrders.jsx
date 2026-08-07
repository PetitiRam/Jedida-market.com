import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as trustApi from '../../api/trustSecurityApi';

const DISPUTE_REASONS = [
  { value: 'item_not_received', label: 'Item not received' },
  { value: 'item_not_as_described', label: 'Item not as described' },
  { value: 'damaged', label: 'Item arrived damaged' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'delivery_issue', label: 'Delivery issue' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'other', label: 'Other' }
];

function DisputeForm({ orderId, onDone }) {
  const [reason, setReason] = useState('item_not_received');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!description) { setError('Please describe the issue.'); return; }
    setBusy(true);
    setError('');
    try {
      await trustApi.openDispute({ orderId, reason, description });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not open dispute.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ width: '100%', marginTop: 8, background: 'var(--cream-dim)', borderRadius: 8, padding: 10 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-group">
        <label>Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {DISPUTE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div className="field-group">
        <label>Describe the issue</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit dispute'}</button>
    </div>
  );
}

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disputingId, setDisputingId] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await client.get('/orders/mine/buyer');
    setOrders(data.orders || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const confirmDelivery = async (id) => {
    await client.post(`/orders/${id}/confirm-delivery`);
    load();
  };

  if (loading) return <div className="empty-state">Loading orders…</div>;

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2>My Orders</h2>
        {orders.length === 0 ? <div className="empty-state">You haven't placed any orders yet.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.map((o) => (
              <div className="card-surface" key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <strong>Order {o.id.slice(0, 8)}</strong>
                  <div className="product-card-meta">{o.currency} {Number(o.total_amount).toLocaleString()} · {new Date(o.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`status-chip status-${o.status}`}>{o.status.replace('_', ' ')}</span>
                <Link to={`/orders/${o.id}/track`} className="btn-link">Track order</Link>
                {['paid_escrow', 'shipped'].includes(o.status) && !o.buyer_confirmed_delivery && (
                  <button className="btn-secondary" onClick={() => confirmDelivery(o.id)}>Confirm delivery received</button>
                )}
                {o.buyer_confirmed_delivery && <span className="product-card-meta">✔ You confirmed delivery</span>}
                {['paid_escrow', 'shipped', 'delivered_confirmed', 'completed'].includes(o.status) && disputingId !== o.id && (
                  <button className="btn-link" onClick={() => setDisputingId(o.id)}>Report a problem</button>
                )}
                {o.status === 'disputed' && <span className="product-card-meta">A dispute is open on this order.</span>}
                {disputingId === o.id && (
                  <DisputeForm orderId={o.id} onDone={() => { setDisputingId(null); load(); }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
