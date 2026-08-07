import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as b2bApi from '../../api/b2bApi';
import QuoteNegotiationThread from '../../components/QuoteNegotiationThread';

const STATUS_LABELS = {
  pending: 'Awaiting quote',
  quoted: 'Quoted — respond below',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired'
};

const PAYMENT_METHODS = [
  { value: 'mtn_mobile_money', label: 'MTN Mobile Money' },
  { value: 'airtel_money', label: 'Airtel Money' }
];

export default function MyQuoteRequests() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const [negotiatingId, setNegotiatingId] = useState(null);
  const [method, setMethod] = useState('mtn_momo');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await b2bApi.myQuoteRequests();
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

  const accept = async (id) => {
    setError('');
    try {
      const { data } = await b2bApi.acceptQuote(id, { method });
      navigate(`/orders/${data.order.id}/track`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not accept quote.');
    }
  };

  if (loading) return <div className="empty-state">Loading quote requests…</div>;

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2>My Quote Requests</h2>
        <Link to="/my-agreements" className="btn-link" style={{ display: 'inline-block', marginBottom: 12 }}>View my purchase agreements</Link>
        {error && <div className="alert alert-error">{error}</div>}

        {quotes.length === 0 ? (
          <div className="empty-state">You haven't requested any quotes yet. Visit a manufacturer or supplier store to get started.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {quotes.map((q) => (
              <div key={q.id} className="card-surface">
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{q.product_title || 'General inquiry'}</strong>
                    <div className="product-card-meta">
                      <Link to={`/s/${q.shop_slug}`} className="btn-link">{q.shop_name}</Link> · {q.quantity_requested} units · {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="product-card-badge">{STATUS_LABELS[q.status] || q.status}</span>
                </div>

                {q.status === 'quoted' && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: '0.9rem', marginBottom: 8 }}>
                      Quoted price: <strong>{q.quoted_unit_price}/unit</strong> {q.quoted_notes && `— ${q.quoted_notes}`}
                    </p>
                    {acceptingId === q.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={method} onChange={(e) => setMethod(e.target.value)}>
                          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <button className="btn-primary" onClick={() => accept(q.id)}>Confirm & pay</button>
                        <button className="btn-secondary" onClick={() => setAcceptingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" onClick={() => setAcceptingId(q.id)}>Accept quote</button>
                        <button className="btn-secondary" onClick={() => decline(q.id)}>Decline</button>
                      </div>
                    )}
                  </div>
                )}

                {['pending', 'quoted'].includes(q.status) && (
                  <div style={{ marginTop: 8 }}>
                    <button className="btn-link" onClick={() => setNegotiatingId(negotiatingId === q.id ? null : q.id)}>
                      {negotiatingId === q.id ? 'Hide negotiation' : 'Negotiate / message supplier'}
                    </button>
                    {negotiatingId === q.id && <QuoteNegotiationThread quoteId={q.id} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
