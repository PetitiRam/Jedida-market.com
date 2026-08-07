import { useEffect, useState } from 'react';
import * as trustApi from '../../api/trustSecurityApi';

const STATUS_OPTIONS = ['open', 'under_review', 'resolved_refund', 'resolved_release', 'resolved_split', 'closed'];

function DisputeDetail({ id, onClose, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('under_review');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => { const { data } = await trustApi.getDispute(id); setDetail(data); };
  useEffect(() => { load(); }, [id]);

  const addNote = async () => {
    if (!note) return;
    await trustApi.addAdminDisputeNote(id, note);
    setNote('');
    load();
  };

  const resolve = async () => {
    setBusy(true);
    try {
      await trustApi.resolveDispute(id, {
        status: resolution, resolutionNotes, refundAmount: refundAmount ? Number(refundAmount) : undefined
      });
      onUpdated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <div className="empty-state">Loading dispute…</div>;

  return (
    <div className="card-surface" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>Dispute — {detail.dispute.reason.replace(/_/g, ' ')}</strong>
        <button className="btn-link" onClick={onClose}>Close</button>
      </div>
      <p style={{ marginTop: 8, fontSize: '0.88rem' }}>{detail.dispute.description}</p>

      <div style={{ marginTop: 10 }}>
        <div className="product-card-meta">Messages</div>
        {detail.messages.length === 0 && <p className="product-card-meta">No messages yet.</p>}
        {detail.messages.map((m) => (
          <div key={m.id} style={{ fontSize: '0.85rem', marginTop: 4, opacity: m.is_admin_note ? 0.8 : 1 }}>
            <strong>{m.sender_username}{m.is_admin_note ? ' (internal note)' : ''}:</strong> {m.message}
          </div>
        ))}
      </div>

      {detail.evidence.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="product-card-meta">Evidence</div>
          {detail.evidence.map((e) => (
            <div key={e.id} style={{ fontSize: '0.85rem' }}><a href={e.file_url} target="_blank" rel="noreferrer">{e.caption || e.file_url}</a></div>
          ))}
        </div>
      )}

      <div className="field-group" style={{ marginTop: 10 }}>
        <label>Add internal note (not visible to buyer/seller)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={addNote}>Add</button>
        </div>
      </div>

      <div style={{ marginTop: 14, borderTop: '1px solid #e5e0d8', paddingTop: 10 }}>
        <div className="field-row" style={{ flexWrap: 'wrap' }}>
          <div className="field-group">
            <label>Resolution</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label>Refund amount (if applicable)</label>
            <input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
          </div>
        </div>
        <textarea rows={2} placeholder="Resolution notes (visible to both parties)" value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} />
        <p className="product-card-meta" style={{ marginTop: 6 }}>
          This records the decision only — issue any refund via the normal Orders & Payouts screen.
        </p>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={resolve}>{busy ? 'Saving…' : 'Save resolution'}</button>
      </div>
    </div>
  );
}

export default function AdminDisputesPanel() {
  const [disputes, setDisputes] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await trustApi.adminListDisputes(statusFilter || undefined);
      setDisputes(data.disputes || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['', ...STATUS_OPTIONS].map((s) => (
          <button key={s || 'all'} className={statusFilter === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatusFilter(s)}>
            {s ? s.replace(/_/g, ' ') : 'All'}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state">Loading disputes…</div>}
      {!loading && disputes.length === 0 && <div className="empty-state">No disputes found.</div>}

      {!loading && disputes.map((d) => (
        <div key={d.id}>
          <div className="card-surface" style={{ marginBottom: openId === d.id ? 0 : 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{d.product_title}</strong>
                <div className="product-card-meta">{d.reason.replace(/_/g, ' ')} · {d.currency} {Number(d.total_amount).toLocaleString()} · {new Date(d.created_at).toLocaleDateString()}</div>
              </div>
              <span className="product-card-badge">{d.status.replace(/_/g, ' ')}</span>
            </div>
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setOpenId(openId === d.id ? null : d.id)}>
              {openId === d.id ? 'Hide' : 'Review'}
            </button>
          </div>
          {openId === d.id && <DisputeDetail id={d.id} onClose={() => setOpenId(null)} onUpdated={load} />}
        </div>
      ))}
    </div>
  );
}
