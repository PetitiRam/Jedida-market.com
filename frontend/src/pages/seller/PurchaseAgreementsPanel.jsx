import { useEffect, useState } from 'react';
import * as bulkOrderApi from '../../api/bulkOrderApi';
import client from '../../api/client';

const STATUS_LABELS = { draft: 'Draft', sent: 'Awaiting response', accepted: 'Accepted — ready for buyer checkout', declined: 'Declined', cancelled: 'Cancelled' };

function CreateAgreementForm({ onDone, onCancel }) {
  const [buyerId, setBuyerId] = useState('');
  const [termsText, setTermsText] = useState('');
  const [lineItems, setLineItems] = useState([{ productId: '', title: '', quantity: '', unitPrice: '' }]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { client.get('/products/mine').then(({ data }) => setProducts(data.products || [])); }, []);

  const updateItem = (idx, field, value) => {
    const next = [...lineItems];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'productId') {
      const p = products.find((pr) => pr.id === value);
      if (p) next[idx].title = p.title;
    }
    setLineItems(next);
  };
  const addItem = () => setLineItems([...lineItems, { productId: '', title: '', quantity: '', unitPrice: '' }]);
  const removeItem = (idx) => setLineItems(lineItems.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!buyerId || !termsText) { setError('Buyer ID and terms are required.'); return; }
    setBusy(true);
    setError('');
    try {
      const shopRes = await client.get('/shops/me');
      await bulkOrderApi.createPurchaseAgreement({
        buyerId, shopId: shopRes.data.shop.id, termsText,
        lineItems: lineItems.filter((li) => li.productId && li.quantity && li.unitPrice)
          .map((li) => ({ productId: li.productId, title: li.title, quantity: Number(li.quantity), unitPrice: Number(li.unitPrice) }))
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create agreement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 12 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-group">
        <label>Buyer user ID</label>
        <input value={buyerId} onChange={(e) => setBuyerId(e.target.value)} placeholder="Paste the buyer's user ID" />
      </div>
      {lineItems.map((li, idx) => (
        <div key={idx} className="field-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field-group">
            <label>Product</label>
            <select value={li.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}>
              <option value="">Select…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="field-group"><label>Quantity</label><input type="number" value={li.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} style={{ width: 90 }} /></div>
          <div className="field-group"><label>Unit price</label><input type="number" value={li.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} style={{ width: 100 }} /></div>
          {lineItems.length > 1 && <button className="btn-link" onClick={() => removeItem(idx)}>Remove</button>}
        </div>
      ))}
      <button className="btn-secondary" onClick={addItem} style={{ marginBottom: 10 }}>+ Add line item</button>
      <div className="field-group">
        <label>Terms (payment schedule, delivery, warranty…)</label>
        <textarea rows={3} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send agreement'}</button>
      </div>
    </div>
  );
}

export default function PurchaseAgreementsPanel() {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  if (loading) return <div className="empty-state">Loading purchase agreements…</div>;

  return (
    <div>
      {!creating && <button className="btn-primary" style={{ marginBottom: 14 }} onClick={() => setCreating(true)}>New purchase agreement</button>}
      {creating && <CreateAgreementForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}

      {agreements.length === 0 && <div className="empty-state">No purchase agreements yet.</div>}
      {agreements.map((a) => (
        <div key={a.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{a.currency} {Number(a.total_amount).toLocaleString()}</strong>
              <div className="product-card-meta">Buyer: {a.buyer_username} · {new Date(a.created_at).toLocaleDateString()}</div>
            </div>
            <span className="product-card-badge">{STATUS_LABELS[a.status] || a.status}</span>
          </div>
          <p style={{ marginTop: 6, fontSize: '0.85rem', color: '#5B6760' }}>{a.terms_text}</p>
        </div>
      ))}
    </div>
  );
}
