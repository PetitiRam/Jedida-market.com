import { useEffect, useState } from 'react';
import * as b2bApi from '../../api/b2bApi';
import QuoteNegotiationThread from '../../components/QuoteNegotiationThread';

const STATUS_LABELS = {
  pending: 'Awaiting your quote',
  quoted: 'Quoted — waiting on buyer',
  accepted: 'Accepted (order placed)',
  declined: 'Declined',
  expired: 'Expired'
};

function RespondForm({ quote, onDone }) {
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!unitPrice) return;
    setBusy(true);
    try {
      await b2bApi.respondToQuote(quote.id, { unitPrice: Number(unitPrice), notes });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send quote.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
      {error && <div className="alert alert-error" style={{ width: '100%' }}>{error}</div>}
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label>Unit price</label>
        <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ width: 120 }} />
      </div>
      <div className="field-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
        <label>Notes (optional)</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lead time, shipping terms…" />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send quote'}</button>
    </form>
  );
}

export default function QuoteRequestsPanel() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState(null);
  const [negotiatingId, setNegotiatingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await b2bApi.incomingQuoteRequests();
      setQuotes(data.quoteRequests || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const decline = async (id) => {
    await b2bApi.declineQuote(id);
    load();
  };

  if (loading) return <div className="empty-state">Loading quote requests…</div>;
  if (quotes.length === 0) return <div className="empty-state">No quote requests yet.</div>;

  return (
    <div>
      {quotes.map((q) => (
        <div key={q.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{q.product_title || 'General inquiry'}</div>
              <div className="product-card-meta">
                {q.quantity_requested} units requested · from {q.buyer_username} · {new Date(q.created_at).toLocaleDateString()}
              </div>
            </div>
            <span className="product-card-badge">{STATUS_LABELS[q.status] || q.status}</span>
          </div>

          {q.message && <p style={{ marginTop: 8, fontSize: '0.85rem', color: '#5B6760' }}>"{q.message}"</p>}

          {q.status === 'quoted' && (
            <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
              Your quote: <strong>{q.quoted_unit_price}/unit</strong> {q.quoted_notes && `— ${q.quoted_notes}`}
            </p>
          )}

          {q.status === 'pending' && respondingTo !== q.id && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={() => setRespondingTo(q.id)}>Send a quote</button>
              <button className="btn-secondary" onClick={() => decline(q.id)}>Decline</button>
            </div>
          )}

          {q.status === 'pending' && respondingTo === q.id && (
            <RespondForm quote={q} onDone={() => { setRespondingTo(null); load(); }} />
          )}

          {['pending', 'quoted'].includes(q.status) && (
            <div style={{ marginTop: 8 }}>
              <button className="btn-link" onClick={() => setNegotiatingId(negotiatingId === q.id ? null : q.id)}>
                {negotiatingId === q.id ? 'Hide negotiation' : 'Negotiate / message buyer'}
              </button>
              {negotiatingId === q.id && <QuoteNegotiationThread quoteId={q.id} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
