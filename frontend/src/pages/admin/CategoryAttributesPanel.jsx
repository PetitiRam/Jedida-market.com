import { useEffect, useState } from 'react';
import * as categoryAttributesApi from '../../api/categoryAttributesApi';

const TYPE_OPTIONS = ['text', 'number', 'boolean', 'select', 'multiselect'];

function SchemaEditor({ schema, onSaved }) {
  const [attributes, setAttributes] = useState(schema.attributes || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateAttr = (idx, patch) => {
    setAttributes(attributes.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };
  const removeAttr = (idx) => setAttributes(attributes.filter((_, i) => i !== idx));
  const addAttr = () => setAttributes([...attributes, { key: '', label: '', type: 'text', required: false }]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await categoryAttributesApi.adminUpsertSchema({ category: schema.category, attributes });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 12 }}>
      <h4 style={{ marginTop: 0 }}>{schema.category.replace(/_/g, ' ')}</h4>
      {error && <div className="alert alert-error">{error}</div>}

      {attributes.map((attr, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="key" value={attr.key} onChange={(e) => updateAttr(idx, { key: e.target.value })} style={{ width: 120 }} />
          <input placeholder="Label" value={attr.label} onChange={(e) => updateAttr(idx, { label: e.target.value })} style={{ width: 140 }} />
          <select value={attr.type} onChange={(e) => updateAttr(idx, { type: e.target.value })}>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {['select', 'multiselect'].includes(attr.type) && (
            <input placeholder="options, comma-separated" value={(attr.options || []).join(', ')}
              onChange={(e) => updateAttr(idx, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              style={{ flex: 1, minWidth: 160 }} />
          )}
          <input placeholder="unit" value={attr.unit || ''} onChange={(e) => updateAttr(idx, { unit: e.target.value })} style={{ width: 80 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
            <input type="checkbox" checked={Boolean(attr.required)} onChange={(e) => updateAttr(idx, { required: e.target.checked })} />
            required
          </label>
          <button type="button" className="btn-link" onClick={() => removeAttr(idx)}>Remove</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn-link" onClick={addAttr}>+ Add attribute</button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save schema'}</button>
      </div>
    </div>
  );
}

export default function CategoryAttributesPanel() {
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await categoryAttributesApi.listAllSchemas();
      setSchemas(data.schemas || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Define which fields make sense per category — a solar panel and a bag of maize shouldn't share the same specification form.
      </p>
      {schemas.map((s) => <SchemaEditor key={s.category} schema={s} onSaved={load} />)}
    </div>
  );
}
