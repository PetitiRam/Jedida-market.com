import { useEffect, useState } from 'react';
import * as wantedApi from '../../api/wantedApi';

const MATCH_STATUS_LABELS = {
  invited: 'New — respond or quote',
  viewed: 'Viewed',
  declined: 'Declined',
  quoted: 'Quoted'
};

function QuoteForm({ match, onDone }) {
  const [unitPrice, setUnitPrice] = useState('');
  const [moq, setMoq] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!unitPrice) return;
    setBusy(true);
    setError('');
    try {
      await wantedApi.submitWantedQuote({
        matchId: match.id,
        unitPrice: Number(unitPrice),
        currency: match.currency,
        moq: moq ? Number(moq) : undefined,
        leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
        message: message || undefined
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit quote.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
      {error && <div className="alert alert-error" style={{ width: '100%' }}>{error}</div>}
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label>Unit price ({match.currency})</label>
        <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ width: 120 }} />
      </div>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label>MOQ</label>
        <input type="number" min="0" value={moq} onChange={(e) => setMoq(e.target.value)} style={{ width: 90 }} />
      </div>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label>Lead time (days)</label>
        <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} style={{ width: 100 }} />
      </div>
      <div className="field-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
        <label>Message (optional)</label>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Shipping terms, notes…" />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send quote'}</button>
    </form>
  );
}

export default function WantedInboxPanel() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quotingId, setQuotingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await wantedApi.incomingWantedMatches();
      setMatches(data.matches || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const markViewed = async (matchId) => {
    await wantedApi.respondToWantedMatch(matchId, 'viewed');
    load();
  };
  const decline = async (matchId) => {
    await wantedApi.respondToWantedMatch(matchId, 'declined');
    load();
  };

  if (loading) return <div className="empty-state">Loading requests matched to your business…</div>;
  if (matches.length === 0) return <div className="empty-state">No buyer requests matched to you yet. Jedida invites you here automatically when a buyer posts something in your category.</div>;

  return (
    <div>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Buyers who posted "What I Want" and were matched to your business, ranked by Jedida's match score.
      </p>
      {matches.map((m) => (
        <div key={m.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{m.title}</div>
              <div className="product-card-meta">
                {m.quantity ? `${m.quantity} ${m.unit || 'units'} · ` : ''}
                {m.destination_country || 'Destination not specified'} · match score {Math.round(m.match_score)}
                {m.required_by_date ? ` · needed by ${new Date(m.required_by_date).toLocaleDateString()}` : ''}
              </div>
            </div>
            <span className="product-card-badge">{MATCH_STATUS_LABELS[m.status] || m.status}</span>
          </div>

          <p style={{ marginTop: 8, fontSize: '0.85rem', color: '#5B6760' }}>{m.description}</p>

          {m.status === 'invited' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-link" onClick={() => markViewed(m.id)}>Mark viewed</button>
              <button className="btn-link" onClick={() => decline(m.id)}>Decline</button>
              <button className="btn-primary" onClick={() => setQuotingId(quotingId === m.id ? null : m.id)}>
                {quotingId === m.id ? 'Cancel' : 'Send quote'}
              </button>
            </div>
          )}
          {(m.status === 'viewed') && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-link" onClick={() => decline(m.id)}>Decline</button>
              <button className="btn-primary" onClick={() => setQuotingId(quotingId === m.id ? null : m.id)}>
                {quotingId === m.id ? 'Cancel' : 'Send quote'}
              </button>
            </div>
          )}

          {quotingId === m.id && <QuoteForm match={m} onDone={() => { setQuotingId(null); load(); }} />}
        </div>
      ))}
    </div>
  );
}
