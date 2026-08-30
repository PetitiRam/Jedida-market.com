import { useEffect, useState, useCallback } from 'react';
import client from '../../api/client';

// See POSRegisterPanel.jsx for the same pattern this mirrors: check
// feature-engine activation, show an enable-it prompt if off. NOTE (see
// LIVE_SHOPPING_PHASE1_NOTES.md): the existing feature engine currently
// defaults new features to ON for every eligible shop, so in practice
// this "not enabled" branch may rarely trigger until that default is
// revisited — kept here anyway since it's the correct check regardless.

function BroadcasterCredentials({ broadcaster, onDismiss }) {
  return (
    <div className="card-surface" style={{ border: '2px solid #B54708', marginBottom: 16 }}>
      <h4 style={{ marginTop: 0, color: '#B54708' }}>Broadcaster credentials — shown once</h4>
      <p style={{ fontSize: '0.85rem' }}>
        Enter these into your broadcasting software (OBS, Streamlabs, or a
        compatible mobile app). <strong>Keep the stream key secret</strong> — anyone with
        it can broadcast to your live event.
      </p>
      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>RTMPS URL</label>
      <input className="jd-input" readOnly value={broadcaster.rtmpsUrl || ''} onFocus={(e) => e.target.select()} style={{ marginBottom: 8 }} />
      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Stream key</label>
      <input className="jd-input" readOnly value={broadcaster.streamKey || ''} onFocus={(e) => e.target.select()} type="password" style={{ marginBottom: 8 }} />
      <button className="btn-secondary" onClick={onDismiss}>I've saved these — hide</button>
    </div>
  );
}

export default function LiveDashboardPanel() {
  const [enabled, setEnabled] = useState(null);
  const [myShopId, setMyShopId] = useState(null);
  const [events, setEvents] = useState([]);
  const [products, setProducts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [broadcaster, setBroadcaster] = useState(null);
  const [liveProducts, setLiveProducts] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/feature-engine/mine').then(({ data }) => {
      const live = data.features.find((f) => f.key === 'live_shopping');
      setEnabled(Boolean(live?.enabled));
    }).catch(() => setEnabled(false));
    client.get('/shops/me').then(({ data }) => setMyShopId(data.id)).catch(() => {});
    client.get('/products/mine').then(({ data }) => setProducts(data.products || data || [])).catch(() => {});
  }, []);

  const loadMyEvents = useCallback(() => {
    if (!myShopId) return;
    client.get('/live/my-events', { params: { shopId: myShopId } }).catch(() => ({ data: { events: [] } }))
      .then(({ data }) => setEvents(data.events || []));
  }, [myShopId]);

  useEffect(() => { loadMyEvents(); }, [loadMyEvents]);

  const refreshLiveDetails = useCallback(async (eventId) => {
    try {
      const [productsRes, eventRes, questionsRes] = await Promise.all([
        client.get(`/live/events/${eventId}/products`),
        client.get(`/live/events/${eventId}`),
        client.get(`/live/events/${eventId}/questions/pending`),
      ]);
      setLiveProducts(productsRes.data.products || []);
      setActiveEvent(eventRes.data);
      setQuestions(questionsRes.data.questions || []);
    } catch { /* transient — next poll retries */ }
  }, []);

  useEffect(() => {
    if (!activeEvent || activeEvent.status !== 'live') return;
    const interval = setInterval(() => refreshLiveDetails(activeEvent.id), 8000);
    return () => clearInterval(interval);
  }, [activeEvent, refreshLiveDetails]);

  const createEvent = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    try {
      const { data } = await client.post('/live/events', { shopId: myShopId, title: title.trim(), description });
      for (const productId of selectedProductIds) {
        await client.post(`/live/events/${data.id}/products`, { productId });
      }
      setTitle(''); setDescription(''); setSelectedProductIds([]); setCreating(false);
      loadMyEvents();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create this live event.');
    }
  };

  const startLive = async (eventId) => {
    setError('');
    try {
      const idempotencyKey = crypto.randomUUID();
      const { data } = await client.post(`/live/events/${eventId}/start`, { idempotencyKey });
      setActiveEvent(data.event);
      setBroadcaster(data.broadcaster);
      refreshLiveDetails(eventId);
      loadMyEvents();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start this live event.');
    }
  };

  const endLive = async (eventId) => {
    try {
      const idempotencyKey = crypto.randomUUID();
      await client.post(`/live/events/${eventId}/end`, { idempotencyKey });
      setActiveEvent(null);
      setBroadcaster(null);
      loadMyEvents();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not end this live event.');
    }
  };

  const featureProduct = async (eventId, productId) => {
    await client.post(`/live/events/${eventId}/products/${productId}/feature`);
    refreshLiveDetails(eventId);
  };

  const answerQuestion = async (eventId, questionId) => {
    await client.post(`/live/events/${eventId}/questions/${questionId}/answer`);
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  const rejectQuestion = async (eventId, questionId) => {
    await client.post(`/live/events/${eventId}/questions/${questionId}/reject`);
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  if (enabled === null) return <div className="empty-state">Checking Live Shopping access…</div>;
  if (enabled === false) {
    return <div className="empty-state">Live Shopping isn't turned on for your shop yet. Enable it from the <strong>Features</strong> tab.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Live Shopping</h3>
        {!activeEvent && <button className="jd-button jd-button-primary" onClick={() => setCreating((v) => !v)}>New Live</button>}
      </div>

      {error && <div className="card-surface" style={{ marginBottom: 12, color: '#B42318' }}>{error}</div>}
      {broadcaster && <BroadcasterCredentials broadcaster={broadcaster} onDismiss={() => setBroadcaster(null)} />}

      {creating && (
        <form onSubmit={createEvent} className="card-surface" style={{ marginBottom: 16 }}>
          <input className="jd-input" placeholder="Live title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
          <textarea className="jd-input" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 8, minHeight: 70 }} />
          <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Products to bring into this Live</label>
          <div style={{ maxHeight: 160, overflowY: 'auto', margin: '6px 0' }}>
            {products.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={selectedProductIds.includes(p.id)}
                  onChange={(e) => setSelectedProductIds((prev) => e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id))}
                />
                {p.title}
              </label>
            ))}
          </div>
          <button className="jd-button jd-button-primary" type="submit">Create</button>
        </form>
      )}

      {activeEvent && activeEvent.status === 'live' && (
        <div className="card-surface" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="status-chip status-active">● LIVE — {activeEvent.title}</span>
            <button className="jd-button jd-button-danger" onClick={() => endLive(activeEvent.id)}>End Live</button>
          </div>

          <h4>Products</h4>
          {liveProducts.map((lp) => (
            <div key={lp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span>{lp.title} {lp.featured && <strong style={{ color: '#0b57d0' }}>(featured)</strong>}</span>
              {!lp.featured && <button className="btn-secondary" onClick={() => featureProduct(activeEvent.id, lp.productId)}>Feature</button>}
            </div>
          ))}

          <h4>Questions</h4>
          {questions.length === 0 && <div style={{ color: '#5B6760', fontSize: '0.85rem' }}>No pending questions.</div>}
          {questions.map((q) => (
            <div key={q.id} className="card-surface" style={{ marginBottom: 6 }}>
              <div>{q.text}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="btn-secondary" onClick={() => answerQuestion(activeEvent.id, q.id)}>Mark answered</button>
                <button className="btn-secondary" onClick={() => rejectQuestion(activeEvent.id, q.id)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h4>Your Live events</h4>
      {events.length === 0 ? (
        <div className="empty-state">No Live events yet.</div>
      ) : (
        events.map((e) => (
          <div key={e.id} className="card-surface" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{e.title}</strong>
              <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>{e.status}</div>
            </div>
            {(e.status === 'ready' || e.status === 'scheduled') && (
              <button className="jd-button jd-button-primary" onClick={() => startLive(e.id)}>Start Live</button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
