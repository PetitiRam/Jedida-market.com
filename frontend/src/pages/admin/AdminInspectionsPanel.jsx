import { useEffect, useState } from 'react';
import * as hubApi from '../../api/chinaTradeHubApi';

const STATUS_LABELS = { requested: 'Requested', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const RESULT_LABELS = { approved: '✅ Approved', rejected: '❌ Rejected', conditional: '⚠️ Conditional' };

function ReportForm({ request, onDone }) {
  const [form, setForm] = useState({
    quantityInspected: '', quantityPassed: '', defectNotes: '', result: 'approved', summary: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await hubApi.adminSubmitInspectionReport(request.id, {
        ...form,
        quantityInspected: form.quantityInspected ? Number(form.quantityInspected) : undefined,
        quantityPassed: form.quantityPassed ? Number(form.quantityPassed) : undefined
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Quantity inspected</label>
          <input type="number" min="0" value={form.quantityInspected} onChange={(e) => setForm({ ...form, quantityInspected: e.target.value })} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 120 }}>
          <label>Quantity passed</label>
          <input type="number" min="0" value={form.quantityPassed} onChange={(e) => setForm({ ...form, quantityPassed: e.target.value })} />
        </div>
      </div>
      <div className="field-group">
        <label>Defect notes</label>
        <textarea rows={2} value={form.defectNotes} onChange={(e) => setForm({ ...form, defectNotes: e.target.value })} />
      </div>
      <div className="field-group">
        <label>Result</label>
        <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="conditional">Conditional</option>
        </select>
      </div>
      <div className="field-group">
        <label>Summary</label>
        <textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
    </form>
  );
}

export default function AdminInspectionsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportingId, setReportingId] = useState(null);
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await hubApi.adminListInspections(filter || undefined);
      setRequests(data.requests || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [filter]);

  const schedule = async (id) => {
    const scheduledFor = prompt('Schedule date (YYYY-MM-DD), or leave blank:');
    await hubApi.adminScheduleInspection(id, { scheduledFor: scheduledFor || undefined });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['', 'requested', 'scheduled', 'completed'].map((s) => (
          <button key={s} className={filter === s ? 'btn-primary' : 'btn-link'} onClick={() => setFilter(s)}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state">Loading…</div>}
      {!loading && requests.length === 0 && <div className="empty-state">No inspection requests.</div>}
      {requests.map((r) => (
        <div key={r.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{r.company_name}</strong>
              <div className="product-card-meta">
                {r.quantity ? `${r.quantity} units · ` : ''}requested {new Date(r.created_at).toLocaleDateString()}
              </div>
              <p style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>{r.product_description}</p>
            </div>
            <span className="product-card-badge">{STATUS_LABELS[r.status] || r.status}</span>
          </div>

          {r.latest_report && (
            <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
              {RESULT_LABELS[r.latest_report.result] || r.latest_report.result}
              {r.latest_report.summary && <p style={{ color: '#5B6760' }}>{r.latest_report.summary}</p>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {r.status === 'requested' && <button className="btn-link" onClick={() => schedule(r.id)}>Schedule</button>}
            {r.status !== 'completed' && (
              <button className="btn-primary" onClick={() => setReportingId(reportingId === r.id ? null : r.id)}>
                {reportingId === r.id ? 'Cancel' : 'Submit report'}
              </button>
            )}
          </div>

          {reportingId === r.id && <ReportForm request={r} onDone={() => { setReportingId(null); load(); }} />}
        </div>
      ))}
    </div>
  );
}
