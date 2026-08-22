import { useEffect, useState } from 'react';
import * as hubApi from '../../api/chinaTradeHubApi';

const STATUS_LABELS = { requested: 'Requested', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

function ReportForm({ request, onDone }) {
  const [form, setForm] = useState({
    businessExistenceConfirmed: false, factoryLocationConfirmed: false, machineryNotes: '',
    workforceSize: '', certificationsConfirmed: '', productSamplesReviewed: false,
    exportHistoryNotes: '', overallResult: 'passed', summary: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await hubApi.adminSubmitFactoryVerificationReport(request.id, {
        ...form,
        workforceSize: form.workforceSize ? Number(form.workforceSize) : undefined,
        certificationsConfirmed: form.certificationsConfirmed.split(',').map((s) => s.trim()).filter(Boolean)
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
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={form.businessExistenceConfirmed} onChange={(e) => setForm({ ...form, businessExistenceConfirmed: e.target.checked })} />
          Business existence confirmed
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={form.factoryLocationConfirmed} onChange={(e) => setForm({ ...form, factoryLocationConfirmed: e.target.checked })} />
          Factory location confirmed
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={form.productSamplesReviewed} onChange={(e) => setForm({ ...form, productSamplesReviewed: e.target.checked })} />
          Product samples reviewed
        </label>
      </div>
      <div className="field-group">
        <label>Workforce size</label>
        <input type="number" min="0" value={form.workforceSize} onChange={(e) => setForm({ ...form, workforceSize: e.target.value })} style={{ width: 120 }} />
      </div>
      <div className="field-group">
        <label>Machinery notes</label>
        <textarea rows={2} value={form.machineryNotes} onChange={(e) => setForm({ ...form, machineryNotes: e.target.value })} />
      </div>
      <div className="field-group">
        <label>Certifications confirmed (comma-separated)</label>
        <input value={form.certificationsConfirmed} onChange={(e) => setForm({ ...form, certificationsConfirmed: e.target.value })} />
      </div>
      <div className="field-group">
        <label>Export history notes</label>
        <textarea rows={2} value={form.exportHistoryNotes} onChange={(e) => setForm({ ...form, exportHistoryNotes: e.target.value })} />
      </div>
      <div className="field-group">
        <label>Overall result</label>
        <select value={form.overallResult} onChange={(e) => setForm({ ...form, overallResult: e.target.value })}>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="needs_more_info">Needs more info</option>
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

export default function AdminFactoryVerificationPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportingId, setReportingId] = useState(null);
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await hubApi.adminListFactoryVerifications(filter || undefined);
      setRequests(data.requests || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [filter]);

  const schedule = async (id) => {
    const scheduledFor = prompt('Schedule date (YYYY-MM-DD), or leave blank:');
    await hubApi.adminScheduleFactoryVerification(id, { scheduledFor: scheduledFor || undefined });
    load();
  };

  const awardBadge = async (businessProfileId) => {
    const criteria = prompt('List criteria met, separated by semicolons (e.g. "Factory verified;Export history confirmed"):');
    if (!criteria) return;
    await hubApi.adminAwardAfricaReadyBadge({
      businessProfileId,
      criteriaMet: criteria.split(';').map((c) => ({ criterion: c.trim() })).filter((c) => c.criterion)
    });
    alert('Badge awarded.');
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
      {!loading && requests.length === 0 && <div className="empty-state">No verification requests.</div>}
      {requests.map((r) => (
        <div key={r.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{r.company_name}</strong>
              <div className="product-card-meta">{r.business_type} · {r.company_country} · requested {new Date(r.created_at).toLocaleDateString()}</div>
            </div>
            <span className="product-card-badge">{STATUS_LABELS[r.status] || r.status}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {r.status === 'requested' && <button className="btn-link" onClick={() => schedule(r.id)}>Schedule</button>}
            {r.status !== 'completed' && (
              <button className="btn-primary" onClick={() => setReportingId(reportingId === r.id ? null : r.id)}>
                {reportingId === r.id ? 'Cancel' : 'Submit report'}
              </button>
            )}
            {r.status === 'completed' && (
              <button className="btn-link" onClick={() => awardBadge(r.business_profile_id)}>Award Africa Ready badge</button>
            )}
          </div>

          {reportingId === r.id && <ReportForm request={r} onDone={() => { setReportingId(null); load(); }} />}
        </div>
      ))}
    </div>
  );
}
