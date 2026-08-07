import { useEffect, useState } from 'react';
import client from '../../api/client';
import Icon from '../../components/icons/icon';

const FILTERS = [
  { key: '', label: 'All shops' },
  { key: 'verified', label: '✓ Verified' },
  { key: 'eligible_not_verified', label: 'Eligible, not yet verified' },
  { key: 'override', label: 'Admin override active' }
];

function FeedModerationQueue() {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('published');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/admin/shop-feed/posts', { params: { status } });
      setPosts(data.posts || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]);

  const remove = async (postId) => {
    const reason = window.prompt('Reason for removing this post (shown internally):') || '';
    await client.patch(`/admin/shop-feed/posts/${postId}/remove`, { reason });
    await load();
  };

  const restore = async (postId) => {
    await client.patch(`/admin/shop-feed/posts/${postId}/restore`);
    await load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['published', 'removed_by_admin', 'draft'].map((s) => (
          <button key={s} className={status === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && posts.length === 0 && <div className="empty-state">No posts here.</div>}
      {!loading && posts.map((p) => (
        <div key={p.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{p.shop_name}</strong> — <span className="product-card-badge">{p.post_type}</span>
              <div className="product-card-meta">{p.caption?.slice(0, 140)}</div>
              <div className="product-card-meta">
                {new Date(p.created_at).toLocaleString()} · ❤ {p.like_count} · 💬 {p.comment_count} · ↗ {p.share_count} · 🔖 {p.save_count}
              </div>
              {p.removed_reason && <div className="product-card-meta">Removed: {p.removed_reason}</div>}
            </div>
            {p.media?.[0]?.url && (
              <img src={p.media[0].url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />
            )}
            <div>
              {p.status === 'published'
                ? <button className="btn-secondary" onClick={() => remove(p.id)}>Remove</button>
                : p.status === 'removed_by_admin' && <button className="btn-secondary" onClick={() => restore(p.id)}>Restore</button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RiskSignalsQueue() {
  const [signals, setSignals] = useState([]);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/admin/risk-signals', { params: { status } });
      setSignals(data.signals || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]);

  const resolve = async (id, newStatus) => {
    await client.patch(`/admin/risk-signals/${id}`, { status: newStatus });
    await load();
  };

  const SIGNAL_LABELS = { fake_followers: 'Fake followers', fake_reviews: 'Fake reviews', quality_decline: 'Quality decline' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['open', 'acknowledged', 'dismissed', 'all'].map((s) => (
          <button key={s} className={status === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && signals.length === 0 && <div className="empty-state">No {status !== 'all' ? status : ''} risk signals.</div>}
      {!loading && signals.map((s) => (
        <div key={s.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{SIGNAL_LABELS[s.signal_type] || s.signal_type}</strong> — {s.shop_name}
              <div className="product-card-meta">Severity {s.severity}/5 · {new Date(s.created_at).toLocaleString()}</div>
              <div className="product-card-meta">{JSON.stringify(s.details)}</div>
              {s.resolved_by_username && <div className="product-card-meta">Handled by {s.resolved_by_username}</div>}
            </div>
            {s.status === 'open' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <button className="btn-secondary" onClick={() => resolve(s.id, 'acknowledged')}>Acknowledge</button>
                <button className="btn-secondary" onClick={() => resolve(s.id, 'dismissed')}>Dismiss</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function GrowthOverview() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await client.get('/admin/growth/overview');
        setOverview(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!overview) return <div className="empty-state">Could not load growth benefits overview.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="card-surface" style={{ flex: 1, minWidth: 140 }}>
          <div className="product-card-meta">Verified shops</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{overview.summary.verified_shop_count}</div>
        </div>
        <div className="card-surface" style={{ flex: 1, minWidth: 140 }}>
          <div className="product-card-meta">Discount campaigns (30d)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{overview.summary.campaigns_last_30d}</div>
        </div>
        <div className="card-surface" style={{ flex: 1, minWidth: 140 }}>
          <div className="product-card-meta">Promo posts (30d)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{overview.summary.promo_posts_last_30d}</div>
        </div>
      </div>

      <div className="card-surface" style={{ marginBottom: 16 }}>
        <strong>Top Verified shops by trust score</strong>
        {overview.topShops.length === 0 && <div className="product-card-meta" style={{ marginTop: 8 }}>No verified shops yet.</div>}
        {overview.topShops.map((s) => (
          <div key={s.id} className="product-card-meta" style={{ marginTop: 6 }}>
            <strong>{s.name}</strong> ({s.primary_category}) — trust {Number(s.trust_score).toFixed(1)} ·
            {' '}{s.completed_orders_count} orders · {s.real_follower_count} followers
          </div>
        ))}
      </div>

      <div className="card-surface">
        <strong>Recent Growth Hub activity</strong>
        {overview.recentActions.length === 0 && <div className="product-card-meta" style={{ marginTop: 8 }}>No promotional campaigns launched yet.</div>}
        {overview.recentActions.map((a) => (
          <div key={a.id} className="product-card-meta" style={{ marginTop: 6 }}>
            {new Date(a.created_at).toLocaleString()} — <strong>{a.shop_name}</strong>: {a.action_type === 'discount_campaign' ? '🏷️ Discount campaign' : '📣 Promo post'}
            {a.details?.code ? ` (${a.details.code})` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  const v = Number(value) || 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#5B6760' }}>
        <span>{label}</span><span>{v.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--cream-dim)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, v)}%`, background: v >= 70 ? 'var(--forest)' : v >= 40 ? '#d97706' : '#dc2626' }} />
      </div>
    </div>
  );
}

function ShopDetailModal({ shopId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('auto');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get(`/admin/verified-shops/${shopId}`);
      setDetail(data);
      setMode(data.shop.verification_mode);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [shopId]);

  const applyOverride = async () => {
    setBusy(true);
    try {
      await client.post(`/admin/verified-shops/${shopId}/override`, { mode, reason });
      await load();
      onChanged();
    } finally {
      setBusy(false);
      setReason('');
    }
  };

  const recompute = async () => {
    setBusy(true);
    try {
      await client.post(`/admin/verified-shops/${shopId}/recompute`);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {loading && <div className="empty-state">Loading…</div>}
        {!loading && detail && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {detail.shop.name}
                {detail.shop.is_verified && <Icon name="checkShield" size={16} color="var(--forest)" />}
              </h3>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>

            {detail.metrics ? (
              <>
                <div className="card-surface" style={{ marginBottom: 12 }}>
                  <strong>Requirements</strong>
                  <div className="product-card-meta" style={{ marginTop: 6 }}>
                    Completed orders: {detail.metrics.completed_orders_count} / {detail.thresholds.minCompletedOrders}
                    {detail.metrics.meets_orders_requirement ? ' ✓' : ' ✗'}
                  </div>
                  <div className="product-card-meta">
                    Real followers: {detail.metrics.real_follower_count} / {detail.thresholds.minFollowers}
                    {' '}({detail.metrics.follower_count} total, {detail.metrics.suspicious_follower_count} flagged suspicious)
                    {detail.metrics.meets_followers_requirement ? ' ✓' : ' ✗'}
                  </div>
                  <div className="product-card-meta">
                    Trust score: {Number(detail.metrics.trust_score).toFixed(1)} / {detail.thresholds.minTrustScore}
                    {detail.metrics.meets_trust_requirement ? ' ✓' : ' ✗'}
                  </div>
                  <div className="product-card-meta">
                    Business profile: {detail.metrics.profile_complete ? 'complete' : 'incomplete'} ·
                    {' '}KYC {detail.metrics.kyc_complete ? 'verified' : 'pending'} ·
                    {' '}Payment info {detail.metrics.payment_verified ? 'verified' : 'unverified'}
                    {detail.metrics.meets_profile_requirement ? ' ✓' : ' ✗'}
                  </div>
                </div>

                <div className="card-surface" style={{ marginBottom: 12 }}>
                  <strong>Trust Engine scores</strong>
                  <div style={{ marginTop: 8 }}>
                    <ScoreBar label="Reliability" value={detail.metrics.reliability_score} />
                    <ScoreBar label="Delivery performance" value={detail.metrics.delivery_score} />
                    <ScoreBar label="Product quality" value={detail.metrics.quality_score} />
                    <ScoreBar label="Customer satisfaction" value={detail.metrics.satisfaction_score} />
                    <ScoreBar label="Response speed" value={detail.metrics.response_score} />
                    <ScoreBar label="Fraud risk (lower is better)" value={detail.metrics.fraud_risk_score} />
                  </div>
                  <div className="product-card-meta" style={{ marginTop: 4 }}>
                    Last computed {new Date(detail.metrics.last_computed_at).toLocaleString()}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">No metrics computed yet.</div>
            )}

            <div className="card-surface" style={{ marginBottom: 12 }}>
              <strong>Verification mode</strong>
              <div className="field-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <div className="field-group">
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="auto">Auto (engine-controlled)</option>
                    <option value="admin_forced_verified">Force verified</option>
                    <option value="admin_forced_blocked">Force blocked / suspend</option>
                  </select>
                </div>
                <div className="field-group" style={{ flex: 1 }}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the seller)…" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-primary" disabled={busy} onClick={applyOverride}>
                  {busy ? 'Saving…' : 'Apply'}
                </button>
                <button className="btn-secondary" disabled={busy} onClick={recompute}>Recompute now</button>
                <button className="btn-secondary" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try { await client.post(`/admin/verified-shops/${shopId}/rescan-protection`); await load(); onChanged(); } finally { setBusy(false); }
                }}>Rescan for fake followers/reviews</button>
              </div>
            </div>

            <div className="card-surface">
              <strong>History</strong>
              {detail.events.length === 0 && <div className="product-card-meta">No events yet.</div>}
              {detail.events.map((e) => (
                <div key={e.id} className="product-card-meta" style={{ marginTop: 4 }}>
                  {new Date(e.created_at).toLocaleString()} — <strong>{e.event_type}</strong>
                  {e.actor_username ? ` by ${e.actor_username}` : ''}
                  {e.reason ? `: ${e.reason}` : ''}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminVerifiedShopsPanel() {
  const [view, setView] = useState('shops');
  const [shops, setShops] = useState([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [sweeping, setSweeping] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/admin/verified-shops', { params: { filter: filter || undefined, search: search || undefined } });
      setShops(data.shops || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [filter]);

  const runSweepNow = async () => {
    setSweeping(true);
    try {
      const { data } = await client.post('/admin/verified-shops/recompute-all');
      setNotice(data.message);
      await load();
    } finally {
      setSweeping(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={view === 'shops' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('shops')}>Shops</button>
        <button className={view === 'risk' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('risk')}>⚠️ AI Risk Signals</button>
        <button className={view === 'feed' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('feed')}>📣 Shop Feed Moderation</button>
        <button className={view === 'growth' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('growth')}>🚀 Growth Benefits</button>
      </div>

      {view === 'risk' && <RiskSignalsQueue />}
      {view === 'feed' && <FeedModerationQueue />}
      {view === 'growth' && <GrowthOverview />}

      {view === 'shops' && (
      <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button key={f.key || 'all'} className={filter === f.key ? 'btn-primary' : 'btn-secondary'} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn-secondary" disabled={sweeping} onClick={runSweepNow}>
          {sweeping ? 'Running sweep…' : '⟳ Recompute all shops'}
        </button>
      </div>

      <div className="field-row" style={{ marginBottom: 14 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Search shop name…" />
        </div>
        <button className="btn-secondary" onClick={load}>Search</button>
      </div>

      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

      {loading && <div className="empty-state">Loading shops…</div>}
      {!loading && shops.length === 0 && <div className="empty-state">No shops match this filter.</div>}

      {!loading && shops.map((s) => (
        <div key={s.id} className="card-surface" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setSelectedShopId(s.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.name}
                {s.is_verified && <Icon name="checkShield" size={15} color="var(--forest)" />}
              </strong>
              <div className="product-card-meta">{s.username} ({s.email})</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="product-card-badge">
                Trust {s.trust_score != null ? Number(s.trust_score).toFixed(1) : '—'}
              </div>
              {s.verification_mode !== 'auto' && (
                <div className="product-card-meta">Override: {s.verification_mode}</div>
              )}
            </div>
          </div>
          <div className="product-card-meta" style={{ marginTop: 6 }}>
            {s.completed_orders_count ?? 0} completed orders · {s.real_follower_count ?? 0} real followers
            {s.eligible && !s.is_verified && ' · eligible, awaiting next sweep'}
          </div>
        </div>
      ))}
      </>
      )}

      {selectedShopId && (
        <ShopDetailModal shopId={selectedShopId} onClose={() => setSelectedShopId(null)} onChanged={load} />
      )}
    </div>
  );
}
