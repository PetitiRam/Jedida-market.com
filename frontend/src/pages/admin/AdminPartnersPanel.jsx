import { useEffect, useState, useCallback } from 'react';
import {
  listPartnerApplications, getPartnerApplication, reviewPartnerApplication,
  bulkReviewPartnerApplications, assignPartnerReviewer, addPartnerApplicationNote,
  listPartnerReviewers, suspendPartnership, reactivatePartnership, exportPartnerApplications
} from '../../api/partnersApi';
import { PARTNER_TYPES } from '../../constants/partnerTypes';

const PARTNER_TYPE_LABELS = Object.fromEntries(PARTNER_TYPES);
const PAGE_SIZE = 25;

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'technical_review', label: 'Technical Review' },
  { key: 'business_review', label: 'Business Review' },
  { key: 'more_info_requested', label: 'More Info Requested' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'suspended', label: 'Suspended' },
];
const STATUS_LABELS = Object.fromEntries(STATUS_TABS.filter((t) => t.key).map((t) => [t.key, t.label]));
const STATUS_COLORS = {
  pending: '#8A9189', under_review: '#1F6FEB', technical_review: '#6A4FC7', business_review: '#0E7C86',
  more_info_requested: '#6FA82E', on_hold: '#B45F06', approved: '#1e7d4f', rejected: '#c04a2c', suspended: '#8a2c2c',
};

// Decisions a reviewer can move an application through. Bulk actions reuse
// the exact same list/endpoint as the single-application review action.
const DECISIONS = [
  { key: 'under_review', label: 'Move to Under Review' },
  { key: 'technical_review', label: 'Move to Technical Review' },
  { key: 'business_review', label: 'Move to Business Review' },
  { key: 'request_more_info', label: 'Request More Information' },
  { key: 'hold', label: 'Put On Hold' },
  { key: 'approve', label: 'Approve' },
  { key: 'reject', label: 'Reject' },
];

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#5B6760';
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
      color, background: `${color}1a`, padding: '3px 10px', borderRadius: 999,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ marginBottom: 8, fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#8A9189' }}>{title}</h4>
      {children}
    </div>
  );
}
function Row({ label, value, block }) {
  return (
    <div style={{ display: block ? 'block' : 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: '0.85rem' }}>
      <span style={{ color: '#8A9189' }}>{label}</span>
      <span style={{ fontWeight: block ? 400 : 600, marginTop: block ? 2 : 0, display: block ? 'block' : 'inline' }}>{value}</span>
    </div>
  );
}

function DetailModal({ id, adminRole, reviewers, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState('');
  const [newNote, setNewNote] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isSuperAdmin = !adminRole || adminRole === 'super_admin';

  const load = useCallback(() => {
    getPartnerApplication(id).then(({ data }) => {
      setData(data);
      setReviewerId(data.application.assigned_reviewer_id || '');
    }).catch(() => setError('Could not load this application.'));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const decide = async (decisionKey, label) => {
    if (!window.confirm(`${label}? The applicant will be emailed automatically.`)) return;
    setBusy(true);
    setError('');
    try {
      await reviewPartnerApplication(id, decisionKey, notes);
      setNotes('');
      onChanged();
      load();
    } catch {
      setError('Could not update the application. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveReviewer = async () => {
    if (!reviewerId) return;
    if (!window.confirm('Assign this reviewer? They will be notified.')) return;
    setBusy(true);
    try {
      await assignPartnerReviewer(id, reviewerId);
      onChanged();
      load();
    } catch {
      setError('Could not assign reviewer.');
    } finally {
      setBusy(false);
    }
  };

  const submitNote = async () => {
    if (!newNote.trim()) return;
    setBusy(true);
    try {
      await addPartnerApplicationNote(id, newNote.trim());
      setNewNote('');
      load();
    } catch {
      setError('Could not save the note.');
    } finally {
      setBusy(false);
    }
  };

  const doSuspend = async () => {
    const reason = window.prompt('Reason for suspending this partnership (shown to the partner):');
    if (reason === null) return;
    setBusy(true);
    try {
      await suspendPartnership(id, reason);
      onChanged();
      load();
    } catch {
      setError('Could not suspend the partnership.');
    } finally {
      setBusy(false);
    }
  };

  const doReactivate = async () => {
    if (!window.confirm('Reactivate this partnership?')) return;
    setBusy(true);
    try {
      await reactivatePartnership(id);
      onChanged();
      load();
    } catch {
      setError('Could not reactivate the partnership.');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return (
    <div style={overlayStyle}><div className="card-surface" style={modalStyle}>{error || 'Loading…'}</div></div>
  );

  const a = data.application;
  const canAct = !['approved', 'rejected', 'suspended'].includes(a.status);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="card-surface" style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0 }}>{a.company_name}</h3>
            <div className="product-card-meta">{a.reference_code} · {PARTNER_TYPE_LABELS[a.partner_type] || a.partner_type} · {a.country}</div>
          </div>
          <StatusBadge status={a.status} />
        </div>

        {error && <p style={{ color: '#b42318', fontSize: '0.85rem' }}>{error}</p>}

        <Section title="Company Information">
          <Row label="Registration #" value={a.registration_number} />
          <Row label="Business Email" value={a.business_email} />
          <Row label="Business Phone" value={a.business_phone} />
          <Row label="Website" value={a.website || '—'} />
          <Row label="Address" value={a.physical_address} />
        </Section>

        <Section title="Contact Information">
          <Row label="Name" value={a.contact_full_name} />
          <Row label="Position" value={a.contact_position} />
          <Row label="Email" value={a.contact_email} />
          <Row label="Phone" value={a.contact_phone} />
        </Section>

        <Section title="Partnership Purpose">
          <Row label="Why partner?" value={a.partnership_reason} block />
          <Row label="Services provided" value={a.services_provided} block />
          <Row label="Expected benefits" value={a.expected_benefits} block />
        </Section>

        <Section title={`Uploaded Documents (${data.documents.length})`}>
          {data.documents.length === 0 && <div className="empty-state">No documents uploaded.</div>}
          {data.documents.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line, #eee)' }}>
              <span style={{ fontSize: '0.85rem' }}>{d.doc_type.replace(/_/g, ' ')}</span>
              <span>
                <a href={d.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.82rem', marginRight: 12 }}>Preview</a>
                <a href={d.file_url} download style={{ fontSize: '0.82rem' }}>Download</a>
              </span>
            </div>
          ))}
        </Section>

        <Section title="Application Timeline">
          <Row label="Submitted" value={new Date(a.created_at).toLocaleString()} />
          {a.reviewed_at && <Row label="Last reviewed" value={new Date(a.reviewed_at).toLocaleString()} />}
          {a.suspended_at && <Row label="Suspended" value={new Date(a.suspended_at).toLocaleString()} />}
        </Section>

        <Section title="Assigned Reviewer">
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} style={{ flex: 1, padding: '7px 10px', borderRadius: 8 }}>
              <option value="">— Unassigned —</option>
              {reviewers.map((r) => (
                <option key={r.id} value={r.id}>{r.full_name || r.username} {r.admin_role ? `(${r.admin_role})` : ''}</option>
              ))}
            </select>
            <button className="btn-secondary" disabled={busy || !reviewerId} onClick={saveReviewer}>Assign</button>
          </div>
        </Section>

        {canAct && (
          <Section title="Review Actions">
            <textarea
              placeholder="Notes for this decision (included in the applicant's email)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', minHeight: 60, padding: 10, borderRadius: 8, marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DECISIONS.map((d) => (
                <button
                  key={d.key}
                  disabled={busy}
                  className={d.key === 'approve' ? 'btn-primary' : 'btn-secondary'}
                  style={{ width: 'auto', padding: '7px 14px', fontSize: '0.82rem' }}
                  onClick={() => decide(d.key, d.label)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Section>
        )}

        {a.status === 'approved' && isSuperAdmin && (
          <Section title="Partnership (Super Admin)">
            <button className="btn-secondary" disabled={busy} onClick={doSuspend}>Suspend Partnership</button>
          </Section>
        )}
        {a.status === 'suspended' && isSuperAdmin && (
          <Section title="Partnership (Super Admin)">
            <button className="btn-primary" style={{ width: 'auto', padding: '8px 18px' }} disabled={busy} onClick={doReactivate}>Reactivate Partnership</button>
            {a.suspended_reason && <p style={{ marginTop: 8, fontSize: '0.82rem', color: '#5B6760' }}>Suspended: {a.suspended_reason}</p>}
          </Section>
        )}

        <Section title="Internal Notes">
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              placeholder="Add an internal note (not visible to the applicant)…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNote()}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 8 }}
            />
            <button className="btn-secondary" disabled={busy || !newNote.trim()} onClick={submitNote}>Add</button>
          </div>
          {data.notes.length === 0 && <div className="empty-state">No internal notes yet.</div>}
          {data.notes.map((n) => (
            <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line, #eee)', fontSize: '0.85rem' }}>
              <div>{n.note}</div>
              <div className="product-card-meta">{n.author_name || 'Unknown'} · {new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </Section>

        <Section title="Status History / Audit Log">
          {data.auditLog.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
          {data.auditLog.map((l) => (
            <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line, #eee)', fontSize: '0.82rem' }}>
              <div>
                <strong>{l.admin_name || 'System'}</strong>{' '}
                {l.action === 'status_change' && <>moved status from <em>{STATUS_LABELS[l.previous_status] || l.previous_status || '—'}</em> to <em>{STATUS_LABELS[l.new_status] || l.new_status}</em></>}
                {l.action === 'reviewer_assigned' && 'assigned a reviewer'}
                {l.action === 'note_added' && 'added an internal note'}
                {l.action === 'suspended' && 'suspended the partnership'}
                {l.action === 'reactivated' && 'reactivated the partnership'}
              </div>
              {l.notes && <div style={{ color: '#5B6760', marginTop: 2 }}>{l.notes}</div>}
              <div className="product-card-meta">{new Date(l.created_at).toLocaleString()}</div>
            </div>
          ))}
        </Section>

        <button className="btn-secondary" style={{ marginTop: 18 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '4vh 16px', overflowY: 'auto' };
const modalStyle = { maxWidth: 640, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 24 };

export default function AdminPartnersPanel({ adminRole }) {
  const [applications, setApplications] = useState(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [partnerType, setPartnerType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [bulkDecision, setBulkDecision] = useState('');
  const [openId, setOpenId] = useState(null);
  const [reviewers, setReviewers] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listPartnerApplications({
      status: status || undefined, search: search || undefined, partnerType: partnerType || undefined,
      page, pageSize: PAGE_SIZE, sortBy, sortDir
    })
      .then(({ data }) => { setApplications(data.applications); setTotal(data.total); })
      .catch(() => { setApplications([]); setTotal(0); });
  }, [status, search, partnerType, page, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listPartnerReviewers().then(({ data }) => setReviewers(data.reviewers)).catch(() => {}); }, []);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [status, search, partnerType]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (!applications) return;
    setSelected((prev) => prev.size === applications.length ? new Set() : new Set(applications.map((a) => a.id)));
  };

  const applyBulk = async () => {
    if (!bulkDecision || selected.size === 0) return;
    const label = DECISIONS.find((d) => d.key === bulkDecision)?.label || bulkDecision;
    if (!window.confirm(`${label} for ${selected.size} application(s)? Each applicant will be emailed automatically.`)) return;
    setBusy(true);
    try {
      await bulkReviewPartnerApplications(Array.from(selected), bulkDecision);
      setSelected(new Set());
      setBulkDecision('');
      load();
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    const { data } = await exportPartnerApplications({ status: status || undefined, search: search || undefined, partnerType: partnerType || undefined });
    downloadBlob(data, `partner-applications-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const SortHeader = ({ col, children }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{ padding: '10px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg, #fff)', borderBottom: '2px solid var(--line, #DCEAE0)' }}
    >
      {children}{sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={status === t.key ? 'btn-primary' : 'btn-secondary'}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search company, contact, email, reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          style={{ padding: '7px 12px', borderRadius: 8, minWidth: 240 }}
        />
        <select value={partnerType} onChange={(e) => setPartnerType(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8 }}>
          <option value="">All partner types</option>
          {PARTNER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn-secondary" style={{ marginLeft: 'auto', width: 'auto', padding: '7px 14px' }} onClick={handleExport}>⬇ Export CSV</button>
      </div>

      {selected.size > 0 && (
        <div className="card-surface" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: 12, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.85rem' }}>{selected.size} selected</strong>
          <select value={bulkDecision} onChange={(e) => setBulkDecision(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8 }}>
            <option value="">Bulk action…</option>
            {DECISIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <button className="btn-primary" style={{ width: 'auto', padding: '6px 16px' }} disabled={busy || !bulkDecision} onClick={applyBulk}>Apply</button>
          <button className="btn-secondary" style={{ width: 'auto', padding: '6px 16px' }} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {applications === null ? (
        <div className="empty-state">Loading…</div>
      ) : applications.length === 0 ? (
        <div className="empty-state">No partner applications match these filters.</div>
      ) : (
        <div className="card-surface" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px', position: 'sticky', top: 0, background: 'var(--bg, #fff)', borderBottom: '2px solid var(--line, #DCEAE0)' }}>
                  <input type="checkbox" checked={selected.size === applications.length} onChange={toggleSelectAll} />
                </th>
                <SortHeader col="company_name">Company Name</SortHeader>
                <SortHeader col="partner_type">Partner Type</SortHeader>
                <SortHeader col="country">Country</SortHeader>
                <th style={{ padding: '10px' }}>Contact Person</th>
                <th style={{ padding: '10px' }}>Business Email</th>
                <SortHeader col="status">Status</SortHeader>
                <SortHeader col="created_at">Date Submitted</SortHeader>
                <th style={{ padding: '10px' }}>Assigned Reviewer</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--line, #eee)' }}>
                  <td style={{ padding: '8px 10px' }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} />
                  </td>
                  <td style={{ padding: '8px 10px', cursor: 'pointer', color: 'var(--forest)', fontWeight: 600 }} onClick={() => setOpenId(a.id)}>
                    {a.company_name}
                    <div className="product-card-meta">{a.reference_code}</div>
                  </td>
                  <td style={{ padding: '8px 10px' }}>{PARTNER_TYPE_LABELS[a.partner_type] || a.partner_type}</td>
                  <td style={{ padding: '8px 10px' }}>{a.country}</td>
                  <td style={{ padding: '8px 10px' }}>{a.contact_full_name}</td>
                  <td style={{ padding: '8px 10px' }}>{a.business_email}</td>
                  <td style={{ padding: '8px 10px' }}><StatusBadge status={a.status} /></td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 10px' }}>{a.assigned_reviewer_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 }}>
        <span className="product-card-meta">{total === 0 ? '0 results' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}</span>
        <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      {openId && (
        <DetailModal id={openId} adminRole={adminRole} reviewers={reviewers} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
}
