import { useEffect, useMemo, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState } from '../settingsCenterUI';

export default function LegalSettingsTab() {
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState('');
  const [content, setContent] = useState('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const { saving, message, run } = useSaveState();

  // Load the full 50-document list (title/category/version only — content is
  // fetched per-document below) so this tab never needs a hardcoded list.
  useEffect(() => {
    api.listLegalDocuments().then(({ data }) => {
      setDocs(data.documents);
      setDocsLoading(false);
      if (data.documents.length > 0) setActiveDoc(data.documents[0].docType);
    });
  }, []);

  const grouped = useMemo(() => {
    const byCategory = {};
    for (const d of docs) {
      if (!byCategory[d.category]) byCategory[d.category] = [];
      byCategory[d.category].push(d);
    }
    return byCategory;
  }, [docs]);

  const load = async (docType) => {
    setLoading(true);
    const { data } = await api.getLegalDocument(docType);
    setContent(data.document.content_md || '');
    setVersion(data.document.version || 0);
    setLoading(false);
  };
  useEffect(() => { if (activeDoc) load(activeDoc); }, [activeDoc]);

  const save = async (e) => {
    e.preventDefault();
    const result = await run(() => api.updateLegalDocument(activeDoc, content));
    if (result) {
      setVersion(result.data.document.version);
      setDocs((prev) => prev.map((d) => (d.docType === activeDoc ? { ...d, version: result.data.document.version } : d)));
    }
  };

  const activeTitle = docs.find((d) => d.docType === activeDoc)?.title || '';

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Legal Documents" description="All 50 Legal Center documents. Every save creates a new version — full history is preserved.">
        {docsLoading ? (
          <div className="empty-state">Loading document list…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
            <div style={{ maxHeight: 560, overflowY: 'auto', borderRight: '1px solid var(--line)', paddingRight: 12 }}>
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category} style={{ marginBottom: 14 }}>
                  <p className="product-card-meta" style={{ fontWeight: 600, marginBottom: 4 }}>{category}</p>
                  {items.map((d) => (
                    <button
                      key={d.docType}
                      onClick={() => setActiveDoc(d.docType)}
                      className={`tab-pill ${activeDoc === d.docType ? 'tab-pill-active' : ''}`}
                      style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
                    >
                      {d.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div>
              {loading ? (
                <div className="empty-state">Loading document…</div>
              ) : (
                <form onSubmit={save}>
                  <h3 style={{ marginTop: 0 }}>{activeTitle}</h3>
                  <p className="product-card-meta" style={{ marginBottom: 8 }}>Current version: v{version}</p>
                  <textarea
                    rows={20} value={content} onChange={(e) => setContent(e.target.value)}
                    placeholder="Write in Markdown — headings, lists, and paragraphs are all supported."
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem', width: '100%' }}
                  />
                  <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>
                    {saving ? 'Publishing…' : `Publish as v${version + 1}`}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
