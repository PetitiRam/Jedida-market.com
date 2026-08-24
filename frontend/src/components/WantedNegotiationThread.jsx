import { useEffect, useState } from 'react';
import * as wantedApi from '../api/wantedApi';

// Negotiation on a Wanted Offer (brief §28). Same message + counter-offer
// shape as the existing QuoteNegotiationThread (bulk-order RFQ flow) —
// intentionally a sibling component rather than a shared one, since the
// two are wired to different endpoints/tables (see the phase90 migration
// header for why). Every message is moderated server-side exactly like
// quote messages and replies — a blocked attempt to share contact
// details surfaces here as a plain error, never silently dropped.
export default function WantedNegotiationThread({ quoteId }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [counterPrice, setCounterPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await wantedApi.listWantedQuoteMessages(quoteId);
    setMessages(data.messages || []);
  };
  useEffect(() => { load(); }, [quoteId]);

  const send = async () => {
    if (!text && !counterPrice) return;
    setBusy(true);
    setError('');
    try {
      await wantedApi.sendWantedQuoteMessage(quoteId, {
        message: text, proposedUnitPrice: counterPrice ? Number(counterPrice) : undefined
      });
      setText('');
      setCounterPrice('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send message.');
    } finally {
      setBusy(false);
    }
  };

  if (messages === null) return <p className="product-card-meta">Loading negotiation…</p>;

  return (
    <div style={{ marginTop: 10, background: 'var(--cream-dim)', borderRadius: 8, padding: 10 }}>
      <div className="product-card-meta" style={{ marginBottom: 6 }}>Negotiation</div>
      {messages.length === 0 && <p className="product-card-meta">No messages yet — start the conversation below.</p>}
      {messages.map((m) => (
        <div key={m.id} style={{ fontSize: '0.85rem', marginBottom: 4 }}>
          <strong>{m.sender_name}:</strong> {m.message}
          {m.proposed_unit_price != null && (
            <span> — counter-offer: <strong>{m.proposed_unit_price}/unit</strong>{m.proposed_moq ? ` · MOQ ${m.proposed_moq}` : ''}</span>
          )}
        </div>
      ))}
      {error && <div className="alert alert-error" style={{ marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <input type="number" placeholder="Counter-offer /unit" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} style={{ width: 140 }} />
        <button className="btn-secondary" disabled={busy} onClick={send}>Send</button>
      </div>
      <p className="product-card-meta" style={{ marginTop: 4 }}>
        For your protection, phone numbers, WhatsApp/social handles and off-platform payment requests can't be shared here.
      </p>
    </div>
  );
}
