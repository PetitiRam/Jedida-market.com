import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import * as commerceApi from '../../api/commerceApi';

// The Go Live service (services/live-go/) is mounted at /api/live/* —
// separate service, same origin, so plain relative paths through the
// shared axios `client` work exactly like any other endpoint (Nginx/Vite
// dev proxy route it to the right backend — see DEPLOY.md §5 and
// vite.config.js). Not using commerceApi.js for these calls since that
// file is Node-backend-specific; kept as direct client.get/post calls
// here instead of inventing a parallel "liveApi.js" for a handful of
// endpoints only this one page uses.

function LiveVideoPlayer({ playback }) {
  if (!playback?.playbackId) {
    return (
      <div style={{ aspectRatio: '16/9', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        {playback?.status === 'ended' ? 'Recording is still processing — check back shortly.' : 'Stream starting soon…'}
      </div>
    );
  }
  // Cloudflare Stream's iframe embed — no player SDK/dependency needed.
  // customerCode comes from the Go service (CLOUDFLARE_STREAM_CUSTOMER_CODE),
  // never hardcoded here.
  const src = playback.customerCode
    ? `https://customer-${playback.customerCode}.cloudflarestream.com/${playback.playbackId}/iframe${playback.signedToken ? `?token=${playback.signedToken}` : ''}`
    : null;
  if (!src) {
    return <div style={{ aspectRatio: '16/9', background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Video unavailable.</div>;
  }
  return (
    <iframe
      src={src}
      style={{ width: '100%', aspectRatio: '16/9', border: 'none' }}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowFullScreen
      title="Live stream"
    />
  );
}

export default function LiveEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [featuredProduct, setFeaturedProduct] = useState(null);
  const [messages, setMessages] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [questionSent, setQuestionSent] = useState(false);
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  const loadEvent = useCallback(async () => {
    try {
      const { data } = await client.get(`/live/events/${id}`);
      setEvent(data);
      if (data.status === 'live' || data.status === 'ended') {
        const pb = await client.get(`/live/events/${id}/playback`);
        setPlayback(pb.data);
      }
      const productsRes = await client.get(`/live/events/${id}/products`);
      setFeaturedProduct(productsRes.data.products?.find((p) => p.featured) || null);
    } catch {
      // event not found / not accessible — page below handles null event
    }
  }, [id]);

  useEffect(() => { loadEvent(); }, [loadEvent]);

  // Poll for status/featured-product changes every 10s — a full realtime
  // event-state channel wasn't built this pass (only chat/presence/
  // question-broadcast are realtime; see LIVE_SHOPPING_PHASE1_NOTES.md).
  useEffect(() => {
    const interval = setInterval(loadEvent, 10000);
    return () => clearInterval(interval);
  }, [loadEvent]);

  // Chat/presence WebSocket — requires login (guests can watch video, per
  // spec §54, but chat/messaging requires an account like everywhere else
  // in Jedida).
  // Chat/presence WebSocket — requires login (guests can watch video, per
  // spec §54, but chat/messaging requires an account like everywhere else
  // in Jedida). Browsers can't set a custom Authorization header on a
  // WebSocket handshake, so the token is sent as the first message after
  // the connection opens instead of a query param (which would end up in
  // the Go service's own request logs) — see chat_ws.go's handshake.
  useEffect(() => {
    const token = localStorage.getItem('jedida_access_token');
    if (!token || !event || event.status !== 'live') return;

    const wsBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/live/events/${id}/realtime`);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'chat') setMessages((prev) => [...prev.slice(-199), msg]);
        else if (msg.type === 'viewer_count') setViewerCount(msg.count);
      } catch { /* ignore malformed frame */ }
    };
    ws.onerror = () => {};

    return () => ws.close();
  }, [id, event?.status]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: chatInput.trim() }));
    setChatInput('');
  };

  const submitQuestion = async (e) => {
    e.preventDefault();
    if (!questionInput.trim()) return;
    try {
      await client.post(`/live/events/${id}/questions`, { text: questionInput.trim() });
      setQuestionInput('');
      setQuestionSent(true);
      setTimeout(() => setQuestionSent(false), 3000);
    } catch {
      // silent — the question box itself gives no other feedback surface here
    }
  };

  const addFeaturedToCart = async () => {
    if (!featuredProduct) return;
    await commerceApi.addToCart(featuredProduct.productId, 1);
    navigate('/cart');
  };

  if (!event) return <div className="empty-state">Loading live event…</div>;

  return (
    <div className="jd-container" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16, marginTop: 16 }}>
      <div>
        <LiveVideoPlayer playback={playback} />
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {event.status === 'live' && <span className="status-chip status-active">● LIVE</span>}
            {event.status === 'live' && <span style={{ fontSize: '0.85rem', color: '#5B6760' }}>{viewerCount} watching</span>}
          </div>
          <h2 style={{ margin: '8px 0 4px' }}>{event.title}</h2>
          {event.description && <p style={{ color: '#5B6760' }}>{event.description}</p>}
        </div>

        <form onSubmit={submitQuestion} className="card-surface" style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Ask the seller a question</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input className="jd-input" value={questionInput} onChange={(e) => setQuestionInput(e.target.value)} placeholder="Type your question…" />
            <button className="jd-button jd-button-primary" type="submit">Ask</button>
          </div>
          {questionSent && <div style={{ color: '#16803c', fontSize: '0.85rem', marginTop: 6 }}>Question sent to the seller.</div>}
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {featuredProduct && (
          <div className="card-surface">
            <h4 style={{ marginTop: 0 }}>Featured product</h4>
            <Link to={`/product/${featuredProduct.productId}`}>{featuredProduct.title || 'View product'}</Link>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => navigate(`/product/${featuredProduct.productId}`)}>View</button>
              <button className="jd-button jd-button-primary" style={{ flex: 1 }} onClick={addFeaturedToCart}>Add to Cart</button>
            </div>
          </div>
        )}

        <div className="card-surface" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
          <h4 style={{ marginTop: 0 }}>Chat</h4>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ fontSize: '0.85rem' }}><strong>{m.userId?.slice(0, 8) || 'viewer'}:</strong> {m.text}</div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendChat} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="jd-input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Say something…" />
            <button className="btn-secondary" type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
