import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function AdminWithdrawalsPanel() {
  const [withdrawals, setWithdrawals] = useState(null);
  const [sweepBusy, setSweepBusy] = useState(false);
  const [sweepResult, setSweepResult] = useState(null);

  const load = () => client.get('/admin/withdrawals', { params: { status: 'pending' } })
    .then(({ data }) => setWithdrawals(data.withdrawals));
  useEffect(() => { load(); }, []);

  const review = async (id, decision) => {
    await client.post(`/admin/withdrawals/${id}/review`, { decision });
    load();
  };

  const runEscrowSweep = async () => {
    setSweepBusy(true); setSweepResult(null);
    try {
      const { data } = await client.post('/orders/escrow/auto-release');
      setSweepResult(`Released ${data.released} order(s) of ${data.checked} checked.`);
    } catch (err) {
      setSweepResult(err.response?.data?.error || 'Sweep failed.');
    } finally {
      setSweepBusy(false);
    }
  };

  return (
    <div>
      <div className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <strong>Escrow protection-period release</strong>
          <div className="product-card-meta">
            Runs automatically every hour. This releases escrow for orders whose buyer protection period has expired without a dispute.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {sweepResult && <span className="product-card-meta">{sweepResult}</span>}
          <button className="btn-secondary" onClick={runEscrowSweep} disabled={sweepBusy}>
            {sweepBusy ? 'Running…' : 'Run sweep now'}
          </button>
        </div>
      </div>

      {withdrawals === null && <div className="empty-state">Loading withdrawal requests…</div>}
      {withdrawals !== null && withdrawals.length === 0 && <div className="empty-state">No withdrawal requests awaiting review.</div>}
      {withdrawals !== null && withdrawals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {withdrawals.map((w) => (
            <div key={w.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{w.full_name}</strong>
                {w.flagged_reason && (
                  <span className="status-chip status-rejected" style={{ marginLeft: 8 }} title={w.flagged_reason}>⚠ Flagged</span>
                )}
                <div className="product-card-meta">{w.email} · {w.currency} {Number(w.amount).toLocaleString()} via {w.method} → {w.destination}</div>
                {w.flagged_reason && <div className="product-card-meta" style={{ color: 'var(--terracotta)' }}>{w.flagged_reason}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => review(w.id, 'approve')}>Pay out</button>
                <button className="btn-secondary" onClick={() => review(w.id, 'reject')}>Reject & refund</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
