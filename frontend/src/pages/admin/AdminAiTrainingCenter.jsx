import { useEffect, useState } from 'react';
import TabBar from '../../components/TabBar';
import { adminAiTrainingApi, KNOWLEDGE_COLLECTIONS, KNOWLEDGE_SOURCE_TYPES } from '../../api/adminAiTrainingApi';

const TABS = [
  { key: 'library', label: '📚 Knowledge Library' },
  { key: 'jobs', label: '🧠 AI Learning Jobs' },
  { key: 'history', label: '🕒 Training History' },
  { key: 'suggested', label: '💡 Suggested Knowledge' },
  { key: 'pending', label: '⏳ Pending Approval' },
  { key: 'published', label: '✅ Published Knowledge' },
  { key: 'performance', label: '📈 Performance Reports' },
];

const STATUS_LABEL = {
  draft: 'Draft', in_review: 'In Review', approved: 'Approved', rejected: 'Rejected',
  indexed: 'Indexed', published: 'Published', archived: 'Archived',
};

function collectionLabel(v) { return KNOWLEDGE_COLLECTIONS.find((c) => c.value === v)?.label || v; }

function Card({ children, style }) {
  return <div className="card-surface" style={{ padding: 14, ...style }}>{children}</div>;
}

function StatusPill({ status }) {
  const colors = {
    draft: '#8a8a8a', in_review: '#b8860b', approved: '#2e7d32', rejected: '#c0392b',
    indexed: '#1565c0', published: '#1b7a43', archived: '#666',
  };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12,
      color: '#fff', background: colors[status] || '#888',
    }}>{STATUS_LABEL[status] || status}</span>
  );
}

function FlagWarning({ flags }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div style={{ background: '#fff3cd', border: '1px solid #ffe08a', color: '#7a5c00', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 13 }}>
      ⚠ Flagged and blocked from moving forward until fixed: {flags.join(', ')}
    </div>
  );
}

// ---------------------------------------------------------------------
// Knowledge Library
// ---------------------------------------------------------------------
function KnowledgeLibrary() {
  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', collection: 'general_marketplace', sourceType: 'help_article', content: '', tags: '' });
  const [flags, setFlags] = useState([]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await adminAiTrainingApi.listKnowledge({ status: statusFilter || undefined, collection: collectionFilter || undefined });
    setItems(data.knowledge);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, collectionFilter]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      const { data } = await adminAiTrainingApi.uploadFile(fd);
      setUploadedFile(data);
    } catch (err) {
      alert(err.friendlyMessage || 'Upload failed.');
    } finally { setBusy(false); }
  };

  const submitDraft = async () => {
    if (!form.title.trim() || !form.content.trim()) return alert('Title and content are required.');
    setBusy(true);
    try {
      const { data } = await adminAiTrainingApi.createKnowledge({
        title: form.title, collection: form.collection, sourceType: form.sourceType,
        content: form.content, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        fileUrl: uploadedFile?.fileUrl, fileType: uploadedFile?.fileType,
      });
      setFlags(data.securityFlags || []);
      if (!data.securityFlags?.length) {
        setForm({ title: '', collection: 'general_marketplace', sourceType: 'help_article', content: '', tags: '' });
        setUploadedFile(null);
        setShowForm(false);
      }
      load();
    } catch (err) {
      alert(err.friendlyMessage || 'Could not create knowledge item.');
    } finally { setBusy(false); }
  };

  const submitReview = async (id) => { await adminAiTrainingApi.submitForReview(id); load(); };
  const review = async (id, decision) => {
    try { await adminAiTrainingApi.reviewKnowledge(id, decision); load(); }
    catch (err) { alert(err.response?.data?.error || 'Could not review this item.'); }
  };
  const archive = async (id) => { if (confirm('Archive this knowledge item?')) { await adminAiTrainingApi.archiveKnowledge(id); load(); } };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
          <option value="">All collections</option>
          {KNOWLEDGE_COLLECTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New Knowledge Item'}
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <h4 style={{ marginTop: 0 }}>New Draft</h4>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <select value={form.collection} onChange={(e) => setForm({ ...form, collection: e.target.value })}>
              {KNOWLEDGE_COLLECTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>
              {KNOWLEDGE_SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input placeholder="tags, comma separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          <textarea placeholder="Content / article body" rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: '#5B6760' }}>Optional source document (PDF / Word / Excel / image with description):</label><br />
            <input type="file" onChange={handleFileChange} disabled={busy} />
            {uploadedFile && <span style={{ marginLeft: 8, fontSize: 12, color: '#2e7d32' }}>Uploaded: {uploadedFile.originalName}</span>}
          </div>
          <FlagWarning flags={flags} />
          <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }} disabled={busy} onClick={submitDraft}>Save as Draft</button>
        </Card>
      )}

      {items === null ? <div className="empty-state">Loading…</div> : items.length === 0 ? (
        <div className="empty-state">No knowledge items match these filters.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <Card key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{item.title}</strong> <StatusPill status={item.status} />
                  <div className="product-card-meta">{collectionLabel(item.collection)} · v{item.version} · submitted by {item.submitted_by_name}</div>
                  {item.security_flags?.length > 0 && <div style={{ fontSize: 12, color: '#c0392b' }}>Flagged: {item.security_flags.join(', ')}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.status === 'draft' && <button className="btn-secondary" onClick={() => submitReview(item.id)}>Submit for Review</button>}
                  {item.status === 'in_review' && (
                    <>
                      <button className="btn-primary" style={{ width: 'auto', padding: '6px 12px' }} onClick={() => review(item.id, 'approve')}>Approve</button>
                      <button className="btn-secondary" onClick={() => review(item.id, 'reject')}>Reject</button>
                    </>
                  )}
                  {['approved', 'indexed', 'published'].includes(item.status) && (
                    <button className="btn-secondary" onClick={() => archive(item.id)}>Archive</button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// AI Learning Jobs — run a training job over approved knowledge
// ---------------------------------------------------------------------
function LearningJobs() {
  const [approved, setApproved] = useState(null);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = async () => {
    const { data } = await adminAiTrainingApi.listKnowledge({ status: 'approved' });
    setApproved(data.knowledge);
  };
  useEffect(() => { load(); }, []);

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const run = async () => {
    if (selected.length === 0) return alert('Select at least one approved item.');
    setBusy(true);
    try {
      const { data } = await adminAiTrainingApi.createJob({ name, knowledgeItemIds: selected });
      setLastResult(data);
      setSelected([]);
      setName('');
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not run the training job.');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0, color: '#5B6760', fontSize: 14 }}>
          Only <strong>approved</strong> knowledge can be indexed. Running a job moves the selected items to
          <strong> Indexed → Published</strong>, making them available to the Jedida AI Assistant.
        </p>
        <input placeholder="Job name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        {approved === null ? <div className="empty-state">Loading…</div> : approved.length === 0 ? (
          <div className="empty-state">No approved knowledge waiting to be indexed.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {approved.map((item) => (
              <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                {item.title} <span className="product-card-meta">({collectionLabel(item.collection)})</span>
              </label>
            ))}
          </div>
        )}
        <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }} disabled={busy || !approved?.length} onClick={run}>
          Run Training Job
        </button>
        {lastResult && <div style={{ marginTop: 10, fontSize: 13, color: '#2e7d32' }}>Indexed {lastResult.indexedCount} item(s) and published them to the AI.</div>}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// Training History
// ---------------------------------------------------------------------
function TrainingHistory() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => { adminAiTrainingApi.listJobs().then(({ data }) => setJobs(data.jobs)); }, []);
  if (jobs === null) return <div className="empty-state">Loading…</div>;
  if (jobs.length === 0) return <div className="empty-state">No training jobs have run yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {jobs.map((j) => (
        <Card key={j.id}>
          <strong>{j.name}</strong> <StatusPill status={j.status === 'completed' ? 'published' : j.status} />
          <div className="product-card-meta">{j.item_count} item(s) · run by {j.triggered_by_name} · {new Date(j.started_at).toLocaleString()}</div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Suggested Knowledge (knowledge gaps)
// ---------------------------------------------------------------------
function SuggestedKnowledge() {
  const [gaps, setGaps] = useState(null);
  const load = async () => { const { data } = await adminAiTrainingApi.listGaps({ status: 'open' }); setGaps(data.gaps); };
  useEffect(() => { load(); }, []);
  const dismiss = async (id) => { await adminAiTrainingApi.dismissGap(id); load(); };

  if (gaps === null) return <div className="empty-state">Loading…</div>;
  if (gaps.length === 0) return <div className="empty-state">No open knowledge gaps — the AI hasn't hit a wall it needed to log.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ color: '#5B6760', fontSize: 14 }}>Topics the AI couldn't answer well. Write a knowledge article to close the gap, then dismiss it here.</p>
      {gaps.map((g) => (
        <Card key={g.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{g.topic}</strong>
              <div className="product-card-meta">Asked {g.frequency_count}× {g.flagged_by_name ? `· flagged by ${g.flagged_by_name}` : '· auto-logged by the assistant'}</div>
            </div>
            <button className="btn-secondary" onClick={() => dismiss(g.id)}>Dismiss</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Pending Approval — suggestions + corrections
// ---------------------------------------------------------------------
function PendingApproval() {
  const [data, setData] = useState(null);
  const load = async () => { const res = await adminAiTrainingApi.listPendingApprovals(); setData(res.data); };
  useEffect(() => { load(); }, []);

  const decideSuggestion = async (id, decision) => { await adminAiTrainingApi.reviewSuggestion(id, decision); load(); };
  const decideCorrection = async (id, decision) => { await adminAiTrainingApi.reviewCorrection(id, decision); load(); };

  if (data === null) return <div className="empty-state">Loading…</div>;
  return (
    <div>
      <h4>FAQ / Knowledge Suggestions</h4>
      {data.suggestions.length === 0 ? <div className="empty-state">Nothing pending.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {data.suggestions.map((s) => (
            <Card key={s.id}>
              <div><strong>Q:</strong> {s.question}</div>
              <div><strong>A:</strong> {s.suggested_answer}</div>
              <div className="product-card-meta">{collectionLabel(s.collection)} · from {s.suggested_by_name} ({s.suggested_by_role.replace('_', ' ')})</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-primary" style={{ width: 'auto', padding: '6px 14px' }} onClick={() => decideSuggestion(s.id, 'approve')}>Approve</button>
                <button className="btn-secondary" onClick={() => decideSuggestion(s.id, 'reject')}>Reject</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h4>Support Answer Corrections</h4>
      {data.corrections.length === 0 ? <div className="empty-state">Nothing pending.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.corrections.map((c) => (
            <Card key={c.id}>
              {c.original_answer && <div style={{ color: '#c0392b' }}><strong>AI said:</strong> {c.original_answer}</div>}
              <div style={{ color: '#2e7d32' }}><strong>Should be:</strong> {c.corrected_answer}</div>
              <div className="product-card-meta">from {c.submitted_by_name}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-primary" style={{ width: 'auto', padding: '6px 14px' }} onClick={() => decideCorrection(c.id, 'approve')}>Approve</button>
                <button className="btn-secondary" onClick={() => decideCorrection(c.id, 'reject')}>Reject</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Published Knowledge
// ---------------------------------------------------------------------
function PublishedKnowledge() {
  const [published, setPublished] = useState(null);
  useEffect(() => { adminAiTrainingApi.listPublished().then(({ data }) => setPublished(data.published)); }, []);
  if (published === null) return <div className="empty-state">Loading…</div>;
  if (published.length === 0) return <div className="empty-state">Nothing has been published to the AI yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ color: '#5B6760', fontSize: 14 }}>This is exactly what the Jedida AI Assistant can currently draw on.</p>
      {published.map((p) => (
        <Card key={p.id}>
          <strong>{p.title}</strong>
          <div className="product-card-meta">{collectionLabel(p.collection)} · published {new Date(p.published_at).toLocaleDateString()}</div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Performance Reports
// ---------------------------------------------------------------------
function PerformanceReports() {
  const [report, setReport] = useState(null);
  useEffect(() => { adminAiTrainingApi.getPerformance().then(({ data }) => setReport(data)); }, []);
  if (report === null) return <div className="empty-state">Loading…</div>;

  const stat = (label, value) => (
    <Card style={{ flex: '1 1 160px', textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value ?? '—'}</div>
      <div className="product-card-meta">{label}</div>
    </Card>
  );

  return (
    <div>
      <p style={{ color: '#5B6760', fontSize: 14 }}>Last {report.periodDays} days.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {stat('Questions answered', report.questionsAnswered)}
        {stat('Human handovers', report.humanHandovers)}
        {stat('Helpful ratings', report.feedback.helpful)}
        {stat('Not helpful ratings', report.feedback.notHelpful)}
        {stat('Accuracy (rated)', report.feedback.accuracyRate !== null ? `${report.feedback.accuracyRate}%` : '—')}
        {stat('Open knowledge gaps', report.openKnowledgeGaps)}
      </div>

      <h4>Knowledge by status</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {report.knowledgeByStatus.map((r) => (
          <Card key={r.status} style={{ padding: '6px 12px' }}><StatusPill status={r.status} /> {r.count}</Card>
        ))}
      </div>

      <h4>Published knowledge by collection</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {report.knowledgeByCollection.map((r) => (
          <Card key={r.collection} style={{ padding: '6px 12px' }}>{collectionLabel(r.collection)}: {r.count}</Card>
        ))}
      </div>
    </div>
  );
}

export default function AdminAiTrainingCenter() {
  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>🎓 AI Training Center</h3>
      <p style={{ color: '#5B6760', marginTop: 0, marginBottom: 16, fontSize: 14 }}>
        The Jedida AI Assistant only ever learns from knowledge that has been drafted, reviewed, and approved here —
        never automatically from private chats, payments, or personal documents.
      </p>
      <TabBar tabs={TABS} initial="library">
        {(active) => (
          <>
            {active === 'library' && <KnowledgeLibrary />}
            {active === 'jobs' && <LearningJobs />}
            {active === 'history' && <TrainingHistory />}
            {active === 'suggested' && <SuggestedKnowledge />}
            {active === 'pending' && <PendingApproval />}
            {active === 'published' && <PublishedKnowledge />}
            {active === 'performance' && <PerformanceReports />}
          </>
        )}
      </TabBar>
    </div>
  );
}
