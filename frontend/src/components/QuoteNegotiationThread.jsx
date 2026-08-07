import { useEffect, useState } from 'react';
import * as bulkOrderApi from '../api/bulkOrderApi';

export default function QuoteNegotiationThread({ quoteId }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [counterPrice, setCounterPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await bulkOrderApi.listQuoteMessages(quoteId);
    setMessages(data.messages || []);
  };
  useEffect(() => { load(); }, [quoteId]);

  const send = async () => {
    if (!text && !counterPrice) return;
    setBusy(true);
    try {
      await bulkOrderApi.sendQuoteMessage(quoteId, {
        message: text, proposedUnitPrice: counterPrice ? Number(counterPrice) : undefined
      });
      setText('');
      setCounterPrice('');
      load();
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
          <strong>{m.sender_username}:</strong> {m.message}
          {m.proposed_unit_price != null && <span> — counter-offer: <strong>{m.proposed_unit_price}/unit</strong>{m.proposed_quantity ? ` × ${m.proposed_quantity}` : ''}</span>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <input type="number" placeholder="Counter-offer /unit" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} style={{ width: 140 }} />
        <button className="btn-secondary" disabled={busy} onClick={send}>Send</button>
      </div>
    </div>
  );
}
