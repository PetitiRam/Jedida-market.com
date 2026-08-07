import { useEffect, useMemo, useState } from 'react';
import * as adminKycApi from '../../api/adminKycApi';
import '../../styles/admin-kyc.css';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Under Review' },
  { key: 'manual_review', label: 'Needs Manual Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const DOC_LABELS = {
  national_id_front: 'National ID (Front)',
  national_id_back: 'National ID (Back)',
  passport: 'Passport',
  driving_permit: 'Driving Permit',
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusPill({ status }) {
  const labelMap = {
    pending: 'Under Review', manual_review: 'Manual Review',
    approved: 'Approved', rejected: 'Rejected',
  };
  return <span className={`akyc-pill akyc-pill-${status}`}>{labelMap[status] || status}</span>;
}

export default function AdminKycReviewPanel() {
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const loadStats = () => adminKycApi.getStats().then(({ data }) => setStats(data.counts)).catch(() => {});

  const loadList = () => {
    setLoading(true);
    adminKycApi.listSubmissions({ status: status || undefined, search: search || undefined })
      .then(({ data }) => setSubmissions(data.submissions))
      .catch((err) => console.error('Load KYC submissions failed:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadList(); }, [status]);

  const runSearch = (e) => { e.preventDefault(); loadList(); };

  const openDetail = (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    setReviewNotes('');
    adminKycApi.getSubmission(id)
      .then(({ data }) => setDetail(data.submission))
      .catch((err) => console.error('Load KYC detail failed:', err))
      .finally(() => setDetailLoading(false));
  };

  const handleAction = async (action) => {
    if (!selectedId) return;
    if ((action === 'reject' || action === 'request_info') && !reviewNotes.trim()) {
      alert('Please add a note explaining the decision before submitting.');
      return;
    }
    setActionBusy(true);
    try {
      const { data } = await adminKycApi.reviewSubmission(selectedId, action, reviewNotes || undefined);
      setDetail(data.submission);
      setReviewNotes('');
      loadList();
      loadStats();
    } catch (err) {
      console.error('KYC action failed:', err);
      alert(err.response?.data?.error || 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const submitNote = async () => {
    if (!noteDraft.trim() || !selectedId) return;
    try {
      const { data } = await adminKycApi.addNote(selectedId, noteDraft);
      setDetail((d) => ({ ...d, internal_notes: data.internalNotes }));
      setNoteDraft('');
    } catch (err) {
      console.error('Add note failed:', err);
    }
  };

  const aiSummary = useMemo(() => {
    if (!detail) return [];
    const docs = detail.documents || {};
    const docQualityOk = Object.values(docs).every((d) => !d || d.quality?.passed !== false);
    const faceCheck = detail.face_check || {};
    return [
      { label: 'Document Quality', value: docQualityOk ? 'Good' : 'Needs review', ok: docQualityOk },
      { label: 'Face Verification', value: faceCheck.clientCheckPassed ? 'Client checks passed' : 'Not completed', ok: !!faceCheck.clientCheckPassed },
      { label: 'Liveness Challenge', value: faceCheck.challengeCompleted ? `Completed (${faceCheck.challengeCompleted})` : '—', ok: !!faceCheck.challengeCompleted },
      { label: 'Duplicate Check', value: 'Not automatically re-checked at review time', ok: null },
      {
        label: 'AI Risk / Face-Match Score',
        value: 'Not available — no scoring model connected yet',
        ok: null,
        note: true,
      },
    ];
  }, [detail]);

  return (
    <div className="akyc-wrap">
      <div className="akyc-tabs">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={`akyc-tab ${status === t.key ? 'active' : ''}`}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
            {stats[t.key] !== undefined && <span className="akyc-tab-count">{stats[t.key]}</span>}
          </button>
        ))}
      </div>

      <form className="akyc-search" onSubmit={runSearch}>
        <input
          placeholder="Search by name, email, ID number, or application ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary btn-small">Search</button>
      </form>

      <div className="akyc-layout">
        <div className="akyc-list">
          {loading && <div className="akyc-empty">Loading…</div>}
          {!loading && submissions.length === 0 && <div className="akyc-empty">No submissions found.</div>}
          {submissions.map((s) => (
            <button
              key={s.id}
              className={`akyc-list-row ${selectedId === s.id ? 'selected' : ''}`}
              onClick={() => openDetail(s.id)}
            >
              <div className="akyc-list-row-main">
                <strong>{s.full_name || s.account_full_name || 'Unnamed applicant'}</strong>
                <span className="akyc-list-row-meta">{s.email} · {s.primary_role}</span>
              </div>
              <div className="akyc-list-row-side">
                <StatusPill status={s.status} />
                <span className="akyc-list-row-time">{timeAgo(s.created_at)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="akyc-detail">
          {!selectedId && <div className="akyc-empty">Select an application to review.</div>}
          {selectedId && detailLoading && <div className="akyc-empty">Loading…</div>}
          {selectedId && !detailLoading && detail && (
            <>
              <div className="akyc-detail-header">
                <div>
                  <h3>{detail.full_name || detail.account_full_name}</h3>
                  <p className="akyc-detail-sub">
                    Application ID: {detail.id} · {detail.email} · {detail.phone}
                  </p>
                  <p className="akyc-detail-sub">
                    Applied {new Date(detail.created_at).toLocaleString()} · <StatusPill status={detail.status} />
                  </p>
                </div>
                <div className="akyc-actions">
                  <button className="btn-secondary btn-small" disabled={actionBusy} onClick={() => handleAction('request_info')}>Request More Info</button>
                  <button className="btn-secondary btn-small akyc-btn-reject" disabled={actionBusy} onClick={() => handleAction('reject')}>Reject</button>
                  <button className="btn-primary btn-small" disabled={actionBusy} onClick={() => handleAction('approve')}>Approve</button>
                </div>
              </div>

              <textarea
                className="akyc-notes-input"
                placeholder="Add a note (required for reject / request info) — visible to other reviewers"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />

              <div className="akyc-detail-grid">
                <div>
                  <h4>Documents</h4>
                  <div className="akyc-doc-grid">
                    {Object.entries(detail.documents || {}).map(([key, doc]) => doc && (
                      <a key={key} href={doc.url} target="_blank" rel="noreferrer" className="akyc-doc-thumb">
                        <img src={doc.url} alt={DOC_LABELS[key] || key} />
                        <span>{DOC_LABELS[key] || key}</span>
                      </a>
                    ))}
                    {detail.face_check?.selfieUrl && (
                      <a href={detail.face_check.selfieUrl} target="_blank" rel="noreferrer" className="akyc-doc-thumb">
                        <img src={detail.face_check.selfieUrl} alt="Selfie" />
                        <span>Selfie</span>
                      </a>
                    )}
                  </div>

                  {detail.business?.business_name && (
                    <>
                      <h4>Business</h4>
                      <p className="akyc-detail-sub">{detail.business.business_name} · Reg #{detail.business.registration_number}</p>
                    </>
                  )}

                  {detail.payment_method?.method && !detail.payment_method?.skipped && (
                    <>
                      <h4>Payment</h4>
                      <p className="akyc-detail-sub">
                        {detail.payment_method.method.replace('_', ' ')} · {detail.payment_method.account_name || '—'}
                        {detail.payment_method.mobile_number ? ` · ${detail.payment_method.mobile_number}` : ''}
                        {detail.payment_method.account_number ? ` · ${detail.payment_method.account_number}` : ''}
                      </p>
                    </>
                  )}

                  <h4>Activity Timeline</h4>
                  <ul className="akyc-timeline">
                    {(detail.activity_log || []).slice().reverse().map((a, i) => (
                      <li key={i}>
                        <strong>{a.action}</strong> — {new Date(a.at).toLocaleString()}
                        {a.notes && <div className="akyc-timeline-note">"{a.notes}"</div>}
                      </li>
                    ))}
                    {(!detail.activity_log || detail.activity_log.length === 0) && <li>No actions yet.</li>}
                  </ul>
                </div>

                <div>
                  <h4>AI Verification Summary</h4>
                  <ul className="akyc-ai-summary">
                    {aiSummary.map((row) => (
                      <li key={row.label} className={row.ok === true ? 'ok' : row.ok === false ? 'warn' : 'neutral'}>
                        <span>{row.label}</span>
                        <span>{row.value}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="akyc-ai-disclaimer">
                    Risk and face-match scores require a connected fraud/face-match model —
                    not wired up in this build. Treat this summary as a checklist of what a
                    reviewer should verify manually, not a verdict.
                  </p>

                  <h4>Internal Notes</h4>
                  <ul className="akyc-notes-list">
                    {(detail.internal_notes || []).slice().reverse().map((n, i) => (
                      <li key={i}>
                        <div>{n.note}</div>
                        <small>{new Date(n.at).toLocaleString()}</small>
                      </li>
                    ))}
                    {(!detail.internal_notes || detail.internal_notes.length === 0) && <li className="akyc-empty-note">No internal notes yet.</li>}
                  </ul>
                  <div className="akyc-note-add">
                    <input
                      placeholder="Add an internal note…"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitNote()}
                    />
                    <button className="btn-secondary btn-small" onClick={submitNote}>Add</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
