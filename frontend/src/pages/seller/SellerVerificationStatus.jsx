import { useEffect, useState } from 'react';
import client from '../../api/client';
import Icon from '../../components/icons/icon';

function RequirementRow({ met, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
      <Icon name={met ? 'checkShield' : 'alertCircle'} size={16} color={met ? 'var(--forest)' : '#d97706'} style={{ marginTop: 2 }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{label}</div>
        <div className="product-card-meta">{detail}</div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  const v = Number(value) || 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#5B6760' }}>
        <span>{label}</span><span>{v.toFixed(1)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--cream-dim)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, v)}%`, background: v >= 70 ? 'var(--forest)' : v >= 40 ? '#d97706' : '#dc2626' }} />
      </div>
    </div>
  );
}

export default function SellerVerificationStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await client.get('/shops/me/verification');
      setStatus(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="empty-state">Loading verification status…</div>;
  if (error || !status) return <div className="empty-state">Could not load your verification status.</div>;

  const { isVerified, mode, thresholds, metrics, whatsMissing, recommendations } = status;

  return (
    <div>
      <div className="card-surface" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="checkShield" size={28} color={isVerified ? 'var(--forest)' : '#8A9189'} />
          <div>
            <h3 style={{ margin: 0 }}>{isVerified ? 'Verified Shop ✓' : 'Not yet a Verified Shop'}</h3>
            <div className="product-card-meta">
              {mode === 'admin_forced_verified' && 'An admin has manually verified your shop.'}
              {mode === 'admin_forced_blocked' && 'An admin has suspended your Verified Shop badge.'}
              {mode === 'auto' && (isVerified
                ? 'Your shop meets every Verified Shop requirement. The badge is checked automatically and can be lost if performance drops.'
                : 'Meet every requirement below to earn the ✓ badge automatically — no application needed.')}
            </div>
          </div>
        </div>
        {!isVerified && whatsMissing?.length > 0 && (
          <div className="alert" style={{ marginTop: 12 }}>
            Still needed: {whatsMissing.join('; ')}.
          </div>
        )}
        <button className="btn-secondary" style={{ marginTop: 12 }} onClick={load}>Refresh status</button>
      </div>

      <div className="card-surface" style={{ marginBottom: 16 }}>
        <strong>Requirements</strong>
        <div style={{ marginTop: 10 }}>
          <RequirementRow
            met={metrics.meets_orders_requirement}
            label="Completed orders"
            detail={`${metrics.completed_orders_count} of ${thresholds.minCompletedOrders} required (cancelled, refunded, and fraud-flagged orders don't count)`}
          />
          <RequirementRow
            met={metrics.meets_followers_requirement}
            label="Customer community"
            detail={`${metrics.real_follower_count} real followers of ${thresholds.minFollowers} required (${metrics.follower_count} total, ${metrics.suspicious_follower_count} flagged as suspicious)`}
          />
          <RequirementRow
            met={metrics.meets_trust_requirement}
            label="Trust score"
            detail={`${Number(metrics.trust_score).toFixed(1)} of ${thresholds.minTrustScore} required`}
          />
          <RequirementRow
            met={metrics.meets_profile_requirement}
            label="Business profile"
            detail={`Profile ${metrics.profile_complete ? 'complete' : 'incomplete'} · KYC ${metrics.kyc_complete ? 'verified' : 'pending'} · Payment info ${metrics.payment_verified ? 'verified' : 'not yet verified'}`}
          />
        </div>
      </div>

      <div className="card-surface">
        <strong>Trust Engine scores</strong>
        <div style={{ marginTop: 10 }}>
          <ScoreBar label="Seller reliability" value={metrics.reliability_score} />
          <ScoreBar label="Delivery performance" value={metrics.delivery_score} />
          <ScoreBar label="Product quality" value={metrics.quality_score} />
          <ScoreBar label="Customer satisfaction" value={metrics.satisfaction_score} />
          <ScoreBar label="Response speed" value={metrics.response_score} />
          <ScoreBar label="Fraud risk (lower is better)" value={metrics.fraud_risk_score} />
        </div>
      </div>

      {recommendations?.length > 0 && (
        <div className="card-surface" style={{ marginTop: 16 }}>
          <strong>💡 AI suggestions to improve your shop</strong>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {recommendations.map((tip, i) => <li key={i} className="product-card-meta" style={{ marginBottom: 6 }}>{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
