import { useEffect, useState } from 'react';
import client from '../../api/client';

const CHANNEL_ICON = { whatsapp: '💬', email: '✉️', jedida_chat: '🛰️' };

function TimelineView({ threadId, onResolved }) {
  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [translateLang, setTranslateLang] = useState('');

  const load = async () => {
    const { data } = await client.get(`/omnichannel/threads/${threadId}`, { params: translateLang ? { lang: translateLang } : {} });
    setData(data);
  };
  useEffect(() => { load(); }, [threadId, translateLang]);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await client.post(`/omnichannel/threads/${threadId}/reply`, { body: reply.trim() });
      setReply('');
      if (res.status === 202 || res.data?.sandbox) {
        // sandbox mode — delivery simulated, still record it
      }
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send reply.');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    await client.patch(`/omnichannel/threads/${threadId}/resolve`);
    onResolved();
  };

  if (!data) return <div className="empty-state">Loading conversation…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>{data.thread.customer_name || data.thread.external_identifier}</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)} style={{ fontSize: '0.8rem' }}>
            <option value="">View original</option>
            <option value="en">Translate to English</option>
            <option value="fr">Translate to French</option>
            <option value="sw">Translate to Swahili</option>
            <option value="zh">Translate to Chinese</option>
            <option value="ar">Translate to Arabic</option>
            <option value="pt">Translate to Portuguese</option>
          </select>
          <button className="btn-link" onClick={resolve}>Mark resolved</button>
        </div>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
        {data.messages.length === 0 && <div className="empty-state">No messages yet.</div>}
        {data.messages.map((m) => (
          <div key={`${m.channel}-${m.id}`} style={{
            marginBottom: 8, textAlign: m.direction === 'outbound' ? 'right' : 'left'
          }}>
            <div style={{
              display: 'inline-block', maxWidth: '80%', padding: '6px 10px', borderRadius: 10,
              background: m.direction === 'outbound' ? 'var(--forest)' : '#EEF3EF',
              color: m.direction === 'outbound' ? '#fff' : '#0B3D24'
            }}>
              <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{CHANNEL_ICON[m.channel] || ''} {m.channel}</div>
              {m.body}
              {m.translatedBody && (
                <div style={{ fontSize: '0.8rem', marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                  {m.translatedBody}
                </div>
              )}
              {m.moderationStatus === 'blocked' && (
                <div style={{ fontSize: '0.7rem', color: '#c0392b', marginTop: 4 }}>⚠ flagged for review</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
        <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" style={{ flex: 1 }} />
        <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
    </div>
  );
}

export default function OmnichannelInboxPanel() {
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const load = async () => {
    const { data } = await client.get('/omnichannel/threads');
    setThreads(data.threads || []);
  };
  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ width: 280 }}>
        <p className="product-card-meta" style={{ marginBottom: 8 }}>WhatsApp + email, merged with in-platform chat per customer.</p>
        {threads.map((t) => (
          <button key={t.id} onClick={() => setActiveId(t.id)}
            className="card-surface" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: 12,
              border: activeId === t.id ? '2px solid var(--forest)' : '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{t.customer_name || t.external_identifier}</strong>
              <span>{CHANNEL_ICON[t.channel]}</span>
            </div>
            <div className="product-card-meta">{t.last_message_preview?.slice(0, 40)}</div>
          </button>
        ))}
        {threads.length === 0 && <div className="empty-state">No conversations yet.</div>}
      </div>
      <div style={{ flex: 1, minWidth: 320 }}>
        {activeId ? <TimelineView threadId={activeId} onResolved={() => { setActiveId(null); load(); }} /> : <div className="empty-state">Select a conversation.</div>}
      </div>
    </div>
  );
}
