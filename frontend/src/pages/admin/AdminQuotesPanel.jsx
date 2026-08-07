import { useEffect, useState } from 'react';
import client from '../../api/client';

function QuoteCard({ q, onRespond }) {
  const [quotedPrice, setQuotedPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (status) => {
    setBusy(true);
    try {
      await onRespond(q.id, { status, quotedPrice: quotedPrice ? Number(quotedPrice) : null, adminNotes: notes });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>{q.product_title}</strong>
          <div className="product-card-meta">Buyer: {q.buyer_name} ({q.buyer_email}) · Seller: {q.seller_name}</div>
        </div>
        <span className={`status-chip status-${q.status === 'quoted' ? 'active' : 'pending_review'}`}>{q.status.replace(/_/g, ' ')}</span>
      </div>

      <div style={{ marginTop: 10, fontSize: '0.88rem' }}>
        {q.requested_quantity && <div>Quantity requested: <strong>{q.requested_quantity}</strong></div>}
        {q.target_price && <div>Buyer's target price: <strong>{q.target_price}</strong></div>}
        {q.message && <p style={{ marginTop: 6, color: '#5B6760' }}>"{q.message}"</p>}
      </div>

      {q.status === 'pending_admin' && (
        <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px', marginTop: 10 }} disabled={busy} onClick={() => act('forwarded_to_seller')}>
          Forward to seller
        </button>
      )}

      {q.status === 'forwarded_to_seller' && (
        <div style={{ marginTop: 10 }}>
          <div className="field-row">
            <div className="field-group"><label>Seller's quoted price</label><input type="number" value={quotedPrice} onChange={(e) => setQuotedPrice(e.target.value)} 
/></div>
          </div>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes to include for the buyer (optional)" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy || !quotedPrice} onClick={() => act('quoted')}>Send quote to 
buyer</button>
            <button className="btn-secondary" disabled={busy} onClick={() => act('declined')}>Decline request</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminQuotesPanel() {
  const [quotes, setQuotes] = useState(null);

  const load = () => client.get('/admin/quotes/pending').then(({ data }) => setQuotes(data.quoteRequests));
  useEffect(() => { load(); }, []);

  const respond = async (id, payload) => {
    await client.patch(`/admin/quotes/${id}`, payload);
    load();
  };

  if (quotes === null) return <div className="empty-state">Loading quote requests…</div>;
  if (quotes.length === 0) return <div className="empty-state">No quote requests awaiting action.</div>;

  return (
    <div>
      <p style={{ color: '#5B6760', marginBottom: 16 }}>
        Buyers request quotes here — forward to the seller, then send back their price. Buyer and seller never connect directly.
      </p>
      {quotes.map((q) => <QuoteCard key={q.id} q={q} onRespond={respond} />)}
    </div>
  );
}
