import { useEffect, useState } from 'react';
import client from '../../api/client';
import {
  getGrowthDashboard, getSalesGrowthPlan, listGrowthActions,
  launchDiscountCampaign, launchPromoPost
} from '../../api/growthApi';
import Icon from '../../components/icons/icon';

const ACTION_LABELS = { discount_campaign: '🏷️ Discount campaign', promo_post: '📣 Promo post' };

function StatCard({ label, value, sub }) {
  return (
    <div className="card-surface" style={{ flex: 1, minWidth: 140 }}>
      <div className="product-card-meta">{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
      {sub && <div className="product-card-meta">{sub}</div>}
    </div>
  );
}

function DiscountCampaignForm({ onLaunched, prefill }) {
  const [code, setCode] = useState(prefill?.code || '');
  const [discountValue, setDiscountValue] = useState(prefill?.discountValue || 10);
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await launchDiscountCampaign({
        code, discountType: 'percent', discountValue: Number(discountValue),
        minOrderAmount: minOrderAmount ? Number(minOrderAmount) : 0, expiresAt
      });
      setCode('');
      onLaunched();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not launch campaign.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 12 }}>
      <strong>🏷️ Launch a discount campaign</strong>
      <div className="field-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <div className="field-group">
          <input placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="field-group">
          <input type="number" min="1" max="90" placeholder="% off" value={discountValue}
                 onChange={(e) => setDiscountValue(e.target.value)} />
        </div>
        <div className="field-group">
          <input type="number" min="0" placeholder="Min order (optional)" value={minOrderAmount}
                 onChange={(e) => setMinOrderAmount(e.target.value)} />
        </div>
      </div>
      {error && <div className="alert" style={{ marginTop: 8 }}>{error}</div>}
      <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !code} onClick={submit}>
        {busy ? 'Launching…' : 'Launch campaign (14 days)'}
      </button>
    </div>
  );
}

function PromoPostForm({ onLaunched, prefill }) {
  const [caption, setCaption] = useState(prefill?.caption || '');
  const [discountPercent, setDiscountPercent] = useState(prefill?.discountPercent || '');
  const [productId, setProductId] = useState(prefill?.productId || '');
  const [myProducts, setMyProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/products/mine').then(({ data }) => setMyProducts(data.products || data || [])).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await launchPromoPost({
        postType: 'promotion', caption,
        productId: productId || undefined,
        discountPercent: discountPercent ? Number(discountPercent) : undefined
      });
      setCaption('');
      onLaunched();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not publish promo post.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 12 }}>
      <strong>📣 Publish a promo post to your Shop Feed</strong>
      <textarea
        value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} style={{ width: '100%', marginTop: 8 }}
        placeholder="What's the promo?"
      />
      <div className="field-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <div className="field-group">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">No product attached</option>
            {myProducts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div className="field-group">
          <input type="number" min="1" max="99" placeholder="Discount % (optional)" value={discountPercent}
                 onChange={(e) => setDiscountPercent(e.target.value)} />
        </div>
      </div>
      {error && <div className="alert" style={{ marginTop: 8 }}>{error}</div>}
      <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !caption.trim()} onClick={submit}>
        {busy ? 'Publishing…' : 'Publish to Shop Feed'}
      </button>
    </div>
  );
}

export default function GrowthHubPanel() {
  const [isVerified, setIsVerified] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [plan, setPlan] = useState(null);
  const [actions, setActions] = useState([]);
  const [campaignPrefill, setCampaignPrefill] = useState(null);
  const [postPrefill, setPostPrefill] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dashRes, planRes, actionsRes] = await Promise.all([
        getGrowthDashboard(), getSalesGrowthPlan(), listGrowthActions()
      ]);
      setDashboard(dashRes.data);
      setPlan(planRes.data);
      setActions(actionsRes.data.actions || []);
      setIsVerified(true);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 404) setIsVerified(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const applySuggestedCampaign = (rec) => {
    if (!rec.suggestedCampaign) return;
    setCampaignPrefill({ code: `SAVE${rec.suggestedCampaign.suggestedCoupon.discountValue}`, discountValue: rec.suggestedCampaign.suggestedCoupon.discountValue });
    setPostPrefill({ caption: rec.suggestedCampaign.suggestedPost.caption, discountPercent: rec.suggestedCampaign.suggestedPost.discountPercent, productId: rec.suggestedCampaign.productId });
  };

  if (loading) return <div className="empty-state">Loading your Growth Hub…</div>;

  if (!isVerified) {
    return (
      <div className="card-surface">
        <h3>🚀 Growth Hub — Verified Shops only</h3>
        <p className="product-card-meta">
          Higher marketplace visibility, priority search ranking, an advanced analytics dashboard, an AI Sales
          Growth Manager, and one-click promotional tools are all benefits of becoming a Verified Shop. Check your
          ✅ Verification tab to see what's still needed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="card-surface" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="checkShield" size={24} color="var(--forest)" />
        <div>
          <strong>Priority search ranking is active</strong>
          <div className="product-card-meta">{dashboard?.searchRanking?.explanation}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard
          label="Category rank"
          value={dashboard?.categoryBenchmark?.verifiedPeerCount > 0 ? `Top ${100 - dashboard.categoryBenchmark.trustScorePercentile}%` : '—'}
          sub={dashboard?.categoryBenchmark?.verifiedPeerCount > 0
            ? `Among ${dashboard.categoryBenchmark.verifiedPeerCount} Verified ${dashboard.categoryBenchmark.category} shops`
            : 'No other Verified shops in your category yet'}
        />
        <StatCard label="Shop Feed posts" value={dashboard?.feedEngagement?.postCount ?? 0}
          sub={`${dashboard?.feedEngagement?.totalLikes ?? 0} likes · ${dashboard?.feedEngagement?.totalComments ?? 0} comments`} />
        <StatCard label="Feed saves & shares" value={(dashboard?.feedEngagement?.totalSaves ?? 0) + (dashboard?.feedEngagement?.totalShares ?? 0)}
          sub={dashboard?.feedEngagement?.lastPostedAt ? `Last posted ${dashboard.feedEngagement.daysSinceLastPost}d ago` : 'No posts yet'} />
      </div>

      <div className="card-surface" style={{ marginBottom: 16 }}>
        <strong>💡 AI Sales Growth Manager</strong>
        <div style={{ marginTop: 10 }}>
          {plan?.recommendations?.map((rec, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < plan.recommendations.length - 1 ? '1px solid var(--cream-dim)' : 'none' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rec.title}</div>
              <div className="product-card-meta">{rec.body}</div>
              {rec.suggestedCampaign && (
                <button className="btn-secondary" style={{ marginTop: 6 }} onClick={() => applySuggestedCampaign(rec)}>
                  Use this suggestion below
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <DiscountCampaignForm onLaunched={load} prefill={campaignPrefill} />
      <PromoPostForm onLaunched={load} prefill={postPrefill} />

      <div className="card-surface">
        <strong>Recent growth activity</strong>
        <div style={{ marginTop: 8 }}>
          {actions.length === 0 && <div className="product-card-meta">No promotional campaigns launched yet.</div>}
          {actions.map((a) => (
            <div key={a.id} className="product-card-meta" style={{ marginBottom: 6 }}>
              {new Date(a.created_at).toLocaleDateString()} — {ACTION_LABELS[a.action_type] || a.action_type}
              {a.details?.code ? `: ${a.details.code}` : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
