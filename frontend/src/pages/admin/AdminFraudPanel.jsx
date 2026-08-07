import { useEffect, useState } from 'react';
import * as trustApi from '../../api/trustSecurityApi';

const STATUS_OPTIONS = ['open', 'reviewing', 'confirmed', 'dismissed'];

export default function AdminFraudPanel() {
  const [flags, setFlags] = useState([]);
  const [statusFilter, setStatusFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await trustApi.listFraudFlags(statusFilter || undefined);
      setFlags(data.flags || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [statusFilter]);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await trustApi.runFraudScan();
      setNotice(data.message);
      load();
    } finally {
      setScanning(false);
    }
  };

  const review = async (id, status) => {
    await trustApi.reviewFraudFlag(id, { status });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map((s) => (
            <button key={s} className={statusFilter === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatusFilter(s)}>{s}</button>
          ))}
        </div>
        <button className="btn-primary" disabled={scanning} onClick={scan}>{scanning ? 'Scanning…' : 'Run fraud scan'}</button>
      </div>

      {notice && <div className="alert alert-success" style={{ marginBottom: 10 }}>{notice}</div>}
      <p className="product-card-meta" style={{ marginBottom: 14 }}>
        The scan checks for rapid cancellations, a high dispute ratio, and unusual login patterns. Nothing is auto-actioned — every
        result lands here for review.
      </p>

      {loading && <div className="empty-state">Loading fraud flags…</div>}
      {!loading && flags.length === 0 && <div className="empty-state">No flags at this status.</div>}

      {!loading && flags.map((f) => (
        <div key={f.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{f.flag_type.replace(/_/g, ' ')}</strong>{f.username && ` — ${f.username}`}
              <div className="product-card-meta">
                Severity {f.severity}/5 · {f.auto_detected ? 'Auto-detected' : 'Manually flagged'} · {new Date(f.created_at).toLocaleDateString()}
              </div>
              <pre style={{ fontSize: '0.78rem', marginTop: 4, whiteSpace: 'pre-wrap' }}>{JSON.stringify(f.details, null, 0)}</pre>
            </div>
            <span className="product-card-badge">{f.status}</span>
          </div>
          {f.status === 'open' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-secondary" onClick={() => review(f.id, 'reviewing')}>Mark reviewing</button>
              <button className="btn-primary" onClick={() => review(f.id, 'confirmed')}>Confirm</button>
              <button className="btn-link" onClick={() => review(f.id, 'dismissed')}>Dismiss</button>
            </div>
          )}
          {f.status === 'reviewing' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={() => review(f.id, 'confirmed')}>Confirm</button>
              <button className="btn-link" onClick={() => review(f.id, 'dismissed')}>Dismiss</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
