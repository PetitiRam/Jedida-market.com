import { useEffect, useState } from 'react';
import * as enterpriseApi from '../../api/enterpriseApi';
import client from '../../api/client';

function EditProductsForm({ collection, onDone }) {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { client.get('/products/mine').then(({ data }) => setProducts(data.products || [])); }, []);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = async () => {
    setBusy(true);
    try {
      await enterpriseApi.setCollectionProducts(collection.id, selected);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      {products.map((p) => (
        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 4 }}>
          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
          {p.title}
        </label>
      ))}
      <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save products'}</button>
    </div>
  );
}

export default function CollectionsPanel() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await enterpriseApi.listMyCollections();
      setCollections(data.collections || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name) return;
    await enterpriseApi.createCollection({ name, description });
    setName('');
    setDescription('');
    load();
  };

  const remove = async (id) => {
    await enterpriseApi.deleteCollection(id);
    load();
  };

  if (loading) return <div className="empty-state">Loading collections…</div>;

  return (
    <div>
      <div className="card-surface" style={{ marginBottom: 14 }}>
        <div className="field-group"><label>Collection name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bestsellers" /></div>
        <div className="field-group"><label>Description (optional)</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <button className="btn-primary" onClick={create}>Create collection</button>
      </div>

      {collections.length === 0 && <div className="empty-state">No collections yet — group your listings to make your storefront easier to browse.</div>}
      {collections.map((c) => (
        <div key={c.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{c.name}</strong>
              <div className="product-card-meta">{c.product_count} product(s){c.description && ` · ${c.description}`}</div>
            </div>
            <button className="btn-link" onClick={() => remove(c.id)}>Delete</button>
          </div>
          <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setEditingId(editingId === c.id ? null : c.id)}>
            {editingId === c.id ? 'Hide' : 'Edit products'}
          </button>
          {editingId === c.id && <EditProductsForm collection={c} onDone={() => { setEditingId(null); load(); }} />}
        </div>
      ))}
    </div>
  );
}
