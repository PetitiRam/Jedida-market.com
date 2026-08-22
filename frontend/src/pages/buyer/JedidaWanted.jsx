import { useEffect, useState } from 'react';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as wantedApi from '../../api/wantedApi';

const REQUEST_STATUS_LABELS = {
  submitted: 'Matching you with businesses…',
  matching: 'Matching you with businesses…',
  matched: 'Matched — awaiting quotes',
  quoted: 'Quotes received',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

function PostForm({ onPosted }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [sampleRequired, setSampleRequired] = useState(false);
  const [customizationRequired, setCustomizationRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Tell us what you need and describe it.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await wantedApi.createWantedRequest({
        title: title.trim(),
        description: description.trim(),
        quantity: quantity ? Number(quantity) : undefined,
        unit: unit || undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
        currency,
        destinationCountry: destinationCountry || undefined,
        destinationCity: destinationCity || undefined,
        requiredByDate: requiredByDate || undefined,
        sampleRequired,
        customizationRequired
      });
      setTitle(''); setDescription(''); setQuantity(''); setUnit('');
      setBudgetMax(''); setDestinationCountry(''); setDestinationCity('');
      setRequiredByDate(''); setSampleRequired(false); setCustomizationRequired(false);
      onPosted(data.wantedRequest);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not post your request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Post What I Want</h3>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Describe what you need — Jedida will classify it and invite matching suppliers, manufacturers and farmers to quote.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="field-group">
        <label>What do you need?</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 10,000 school uniforms" />
      </div>
      <div className="field-group">
        <label>Details</label>
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Specs, quality requirements, delivery timeline…" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Quantity</label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pieces, tons…" />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Max budget</label>
          <input type="number" min="0" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 100 }}>
          <label>Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Destination country</label>
          <input value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Destination city</label>
          <input value={destinationCity} onChange={(e) => setDestinationCity(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Needed by</label>
          <input type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, margin: '8px 0 12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={sampleRequired} onChange={(e) => setSampleRequired(e.target.checked)} />
          I'd like a sample first
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={customizationRequired} onChange={(e) => setCustomizationRequired(e.target.checked)} />
          I need customization
        </label>
      </div>

      <button className="btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post request'}</button>
    </form>
  );
}

function RequestDetail({ id, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await wantedApi.getWantedRequest(id);
      setDetail(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const accept = async (quoteId) => {
    await wantedApi.acceptWantedQuote(quoteId);
    load();
  };
  const decline = async (quoteId) => {
    await wantedApi.declineWantedQuote(quoteId);
    load();
  };

  if (loading || !detail) return <div className="empty-state">Loading…</div>;
  const { wantedRequest, matches, quotes } = detail;

  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{wantedRequest.title}</h3>
        <button className="btn-link" onClick={onClose}>Close</button>
      </div>
      <p className="product-card-meta">{REQUEST_STATUS_LABELS[wantedRequest.status] || wantedRequest.status} · category: {wantedRequest.category}</p>

      <h4>Quotes ({quotes.length})</h4>
      {quotes.length === 0 && <div className="empty-state">No quotes yet — invited businesses are reviewing your request.</div>}
      {quotes.map((q) => (
        <div key={q.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{q.business_name} {q.shop_name ? `— ${q.shop_name}` : ''}</div>
              <div className="product-card-meta">
                {q.currency} {q.unit_price} / unit
                {q.moq ? ` · MOQ ${q.moq}` : ''}
                {q.lead_time_days ? ` · ${q.lead_time_days}d lead time` : ''}
              </div>
              {q.message && <p style={{ fontSize: '0.85rem', marginTop: 4 }}>"{q.message}"</p>}
            </div>
            <span className="product-card-badge">{q.status}</span>
          </div>
          {q.status === 'submitted' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={() => accept(q.id)}>Accept</button>
              <button className="btn-link" onClick={() => decline(q.id)}>Decline</button>
            </div>
          )}
        </div>
      ))}

      <h4>Invited businesses ({matches.length})</h4>
      {matches.map((m) => (
        <div key={m.id} className="product-card-meta" style={{ marginBottom: 4 }}>
          {m.business_name} — {m.status} (match score {Math.round(m.match_score)})
        </div>
      ))}
    </div>
  );
}

export default function JedidaWanted() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await wantedApi.myWantedRequests();
      setRequests(data.wantedRequests || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2 style={{ marginBottom: 4 }}>Jedida Wanted</h2>
        <p style={{ color: '#5B6760', marginBottom: 16 }}>Post what you need — Jedida finds and invites the right businesses to quote.</p>

        <PostForm onPosted={() => { load(); }} />

        {openId && <RequestDetail id={openId} onClose={() => { setOpenId(null); load(); }} />}

        <h3>My requests</h3>
        {loading && <div className="empty-state">Loading…</div>}
        {!loading && requests.length === 0 && <div className="empty-state">You haven't posted a request yet.</div>}
        {requests.map((r) => (
          <div key={r.id} className="card-surface" style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => setOpenId(r.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div className="product-card-meta">
                  {new Date(r.created_at).toLocaleDateString()} · {r.match_count} matched · {r.live_quote_count} quote(s)
                </div>
              </div>
              <span className="product-card-badge">{REQUEST_STATUS_LABELS[r.status] || r.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
