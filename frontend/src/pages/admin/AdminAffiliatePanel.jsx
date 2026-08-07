import { useEffect, useState } from 'react';
import client from '../../api/client';

function StatCard({ label, value }) {
  return (
    <div className="card-surface" style={{ minWidth: 160, flex: '1 1 160px' }}>
      <div className="product-card-meta">{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function AdminAffiliatePanel() {
  const [overview, setOverview] = useState(null);
  const [heldCommissions, setHeldCommissions] = useState(null);
  const [withdrawals, setWithdrawals] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const loadOverview = () => client.get('/admin/affiliate/overview').then(({ data }) => setOverview(data));
  const loadHeldCommissions = () => client.get('/admin/affiliate/commissions/held').then(({ data }) => setHeldCommissions(data.commissions));
  const loadWithdrawals = () => client.get('/admin/affiliate/withdrawals', { params: { status: 'pending' } }).then(({ data }) => setWithdrawals(data.withdrawals));
  const loadReferrals = () => client.get('/admin/affiliate/referrals', { params: showFlaggedOnly ? { flagged: 'true' } : {} }).then(({ data }) => setReferrals(data.referrals));

  useEffect(() => { loadOverview(); loadHeldCommissions(); loadWithdrawals(); }, []);
  useEffect(() => { loadReferrals(); }, [showFlaggedOnly]);

  const reviewCommission = async (id, decision) => {
    await client.post(`/admin/affiliate/commissions/${id}/review`, { decision });
    loadHeldCommissions();
    loadOverview();
  };

  const reviewWithdrawal = async (id, decision) => {
    await client.post(`/admin/affiliate/withdrawals/${id}/review`, { decision });
    loadWithdrawals();
    loadOverview();
  };

  return (
    <div>
      {overview && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard label="Total referrals" value={overview.totalReferrals} />
          <StatCard label="Flagged referrals" value={overview.flaggedReferrals} />
          <StatCard label="Available commissions" value={overview.availableCommissionsTotal.toLocaleString()} />
          <StatCard label="Held commissions" value={`${overview.heldCommissionsCount} (${overview.heldCommissionsTotal.toLocaleString()})`} />
          <StatCard label="Pending withdrawals" value={`${overview.pendingWithdrawalsCount} (${overview.pendingWithdrawalsTotal.toLocaleString()})`} />
        </div>
      )}

      <h4 style={{ marginBottom: 8 }}>Commissions held for review</h4>
      {heldCommissions === null && <div className="empty-state">Loading held commissions…</div>}
      {heldCommissions !== null && heldCommissions.length === 0 && <div className="empty-state">No commissions currently held for review.</div>}
      {heldCommissions !== null && heldCommissions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {heldCommissions.map((c) => (
            <div key={c.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{c.referrer_name}</strong> — {c.type === 'upgrade' ? 'Upgrade' : 'Sale'} commission
                <div className="product-card-meta">
                  {c.currency} {Number(c.amount).toLocaleString()} ({c.percent_applied}% of {Number(c.base_amount).toLocaleString()}) from referral {c.referred_user_name}
                </div>
                <div className="product-card-meta" style={{ color: 'var(--terracotta)' }}>{c.hold_reason}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => reviewCommission(c.id, 'approve')}>Approve</button>
                <button className="btn-secondary" onClick={() => reviewCommission(c.id, 'reject')}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ marginBottom: 8 }}>Withdrawal requests</h4>
      {withdrawals === null && <div className="empty-state">Loading withdrawal requests…</div>}
      {withdrawals !== null && withdrawals.length === 0 && <div className="empty-state">No affiliate withdrawal requests awaiting review.</div>}
      {withdrawals !== null && withdrawals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {withdrawals.map((w) => (
            <div key={w.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{w.full_name}</strong>
                <div className="product-card-meta">{w.email} · {w.currency} {Number(w.amount).toLocaleString()} via {w.method} → {w.destination || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => reviewWithdrawal(w.id, 'approve')}>Pay out</button>
                <button className="btn-secondary" onClick={() => reviewWithdrawal(w.id, 'reject')}>Reject & refund</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>Referrals</h4>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={showFlaggedOnly} onChange={(e) => setShowFlaggedOnly(e.target.checked)} />
          Flagged only
        </label>
      </div>
      {referrals === null && <div className="empty-state">Loading referrals…</div>}
      {referrals !== null && referrals.length === 0 && <div className="empty-state">No referrals to show.</div>}
      {referrals !== null && referrals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {referrals.map((r) => (
            <div key={r.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{r.referrer_name}</strong> referred <strong>{r.referred_name}</strong>
                {r.fraud_flag && (
                  <span className="status-chip status-rejected" style={{ marginLeft: 8 }} title={r.fraud_flag}>⚠ {r.fraud_flag}</span>
                )}
                <div className="product-card-meta">{r.referrer_email} → {r.referred_email} · {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
