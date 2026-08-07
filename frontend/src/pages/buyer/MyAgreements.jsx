import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as bulkOrderApi from '../../api/bulkOrderApi';

const STATUS_LABELS = { draft: 'Draft', sent: 'Awaiting your response', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' };
const PAYMENT_METHODS = [
  { value: 'mtn_mobile_money', label: 'MTN Mobile Money' },
  { value: 'airtel_money', label: 'Airtel Money' }
];

export default function MyAgreements() {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingOutId, setCheckingOutId] = useState(null);
  const [method, setMethod] = useState('mtn_mobile_money');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await bulkOrderApi.myPurchaseAgreements();
      setAgreements(data.agreements || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const respond = async (id, action) => {
    await bulkOrderApi.respondPurchaseAgreement(id, action);
    load();
  };

  const checkout = async (id) => {
    setError('');
    if (!address) { setError('Please enter a shipping address.'); return; }
    try {
      const { data } = await bulkOrderApi.checkoutPurchaseAgreement(id, { method, shippingAddress: address });
      navigate(`/orders/${data.orders[0].id}/track`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not check out this agreement.');
    }
  };

  if (loading) return <div className="empty-state">Loading purchase agreements…</div>;

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2>My Purchase Agreements</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {agreements.length === 0 ? (
          <div className="empty-state">You haven't received any purchase agreements yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agreements.map((a) => (
              <div key={a.id} className="card-surface">
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{a.shop_name}</strong>
                    <div className="product-card-meta">{a.currency} {Number(a.total_amount).toLocaleString()} · {new Date(a.created_at).toLocaleDateString()}</div>
                  </div>
                  <span className="product-card-badge">{STATUS_LABELS[a.status] || a.status}</span>
                </div>
                <p style={{ marginTop: 8, fontSize: '0.85rem', color: '#5B6760' }}>{a.terms_text}</p>
                <div style={{ marginTop: 8 }}>
                  {(a.line_items || []).map((li, idx) => (
                    <div key={idx} style={{ fontSize: '0.85rem' }}>{li.title} — {li.quantity} × {li.unitPrice}</div>
                  ))}
                </div>

                {a.status === 'sent' && !a.buyer_accepted_at && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn-primary" onClick={() => respond(a.id, 'accept')}>Accept</button>
                    <button className="btn-secondary" onClick={() => respond(a.id, 'decline')}>Decline</button>
                  </div>
                )}

                {a.status === 'accepted' && !a.resulting_order_id && (
                  checkingOutId === a.id ? (
                    <div style={{ marginTop: 10 }}>
                      <div className="field-group"><label>Shipping address</label><input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
                      <div className="field-group">
                        <label>Payment method</label>
                        <select value={method} onChange={(e) => setMethod(e.target.value)}>
                          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <button className="btn-primary" onClick={() => checkout(a.id)}>Confirm & pay</button>
                    </div>
                  ) : (
                    <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => setCheckingOutId(a.id)}>Check out this agreement</button>
                  )
                )}
                {a.resulting_order_id && <p className="product-card-meta" style={{ marginTop: 8 }}>✔ Checked out — see My Orders for tracking.</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
