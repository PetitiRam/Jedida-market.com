import { useEffect, useState } from 'react';
import client from '../../api/client';
import * as b2bApi from '../../api/b2bApi';
import Icon from '../../components/icons/icon';

function TierEditor({ product, onClose }) {
  const [tiers, setTiers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    b2bApi.getProductTiers(product.id).then(({ data }) => {
      setTiers((data.tiers || []).map((t) => ({ minQuantity: t.min_quantity, maxQuantity: t.max_quantity, unitPrice: t.unit_price })));
    });
  }, [product.id]);

  const addRow = () => setTiers((t) => [...t, { minQuantity: '', maxQuantity: '', unitPrice: '' }]);
  const updateRow = (i, field, value) => setTiers((t) => t.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  const removeRow = (i) => setTiers((t) => t.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const payload = tiers
        .filter((t) => t.minQuantity !== '' && t.unitPrice !== '')
        .map((t) => ({ minQuantity: Number(t.minQuantity), maxQuantity: t.maxQuantity === '' ? null : Number(t.maxQuantity), unitPrice: Number(t.unitPrice) }));
      await b2bApi.saveProductTiers(product.id, payload);
      setNotice('Pricing tiers saved.');
      setTimeout(() => setNotice(''), 2000);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not save pricing tiers.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(22,32,27,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} className="card-surface" style={{ maxWidth: 520, width: '92%' }}>
        <h3 style={{ marginBottom: 4 }}>Quantity discount tiers</h3>
        <p className="product-card-meta" style={{ marginBottom: 14 }}>For: {product.title} · MOQ {product.minimum_order_quantity} units</p>

        {notice && <div className="alert alert-success">{notice}</div>}

        {tiers.map((t, i) => (
          <div key={i} className="field-row" style={{ alignItems: 'center' }}>
            <div className="field-group" style={{ marginBottom: 8 }}>
              <label>Min qty</label>
              <input type="number" min="1" value={t.minQuantity} onChange={(e) => updateRow(i, 'minQuantity', e.target.value)} />
            </div>
            <div className="field-group" style={{ marginBottom: 8 }}>
              <label>Max qty (blank = and up)</label>
              <input type="number" min="1" value={t.maxQuantity} onChange={(e) => updateRow(i, 'maxQuantity', e.target.value)} />
            </div>
            <div className="field-group" style={{ marginBottom: 8 }}>
              <label>Unit price ({product.currency})</label>
              <input type="number" min="0" step="0.01" value={t.unitPrice} onChange={(e) => updateRow(i, 'unitPrice', e.target.value)} />
            </div>
            <button type="button" className="btn-link" onClick={() => removeRow(i)}><Icon name="trash" size={16} /></button>
          </div>
        ))}

        <button type="button" className="btn-secondary" onClick={addRow} style={{ marginBottom: 14 }}>+ Add tier</button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save tiers'}</button>
        </div>
      </div>
    </div>
  );
}

function CertificateEditor({ product, onClose }) {
  const [certificates, setCertificates] = useState([]);
  const [form, setForm] = useState({ name: '', issuingBody: '', fileUrl: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => b2bApi.getProductCertificates(product.id).then(({ data }) => setCertificates(data.certificates || []));
  useEffect(() => { load(); }, [product.id]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name || !form.fileUrl) { setNotice('Certificate name and file link are required.'); return; }
    setBusy(true);
    try {
      await b2bApi.addProductCertificate(product.id, form);
      setForm({ name: '', issuingBody: '', fileUrl: '' });
      load();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not add certificate.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    await b2bApi.deleteProductCertificate(id);
    load();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(22,32,27,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} className="card-surface" style={{ maxWidth: 480, width: '92%' }}>
        <h3 style={{ marginBottom: 4 }}>Product certificates</h3>
        <p className="product-card-meta" style={{ marginBottom: 14 }}>For: {product.title}</p>

        {notice && <div className="alert alert-error">{notice}</div>}

        {certificates.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--cream-dim)' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              {c.issuing_body && <div className="product-card-meta">{c.issuing_body}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <a href={c.file_url} target="_blank" rel="noreferrer" className="btn-link">View</a>
              <button type="button" className="btn-link" onClick={() => remove(c.id)}><Icon name="trash" size={16} /></button>
            </div>
          </div>
        ))}

        <form onSubmit={add} style={{ marginTop: 14 }}>
          <div className="field-group">
            <label>Certificate name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. ISO 9001" />
          </div>
          <div className="field-group">
            <label>Issuing body (optional)</label>
            <input value={form.issuingBody} onChange={(e) => setForm((f) => ({ ...f, issuingBody: e.target.value }))} />
          </div>
          <div className="field-group">
            <label>File link (uploaded via Shop Settings → Uploads)</label>
            <input value={form.fileUrl} onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))} placeholder="https://…" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Close</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? 'Adding…' : 'Add certificate'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WholesaleCatalogPanel() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tierProduct, setTierProduct] = useState(null);
  const [certProduct, setCertProduct] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/products/mine');
      setProducts(data.products || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="empty-state">Loading your wholesale catalog…</div>;
  if (products.length === 0) return <div className="empty-state">Add products first, then set bulk pricing tiers and certificates here.</div>;

  return (
    <div>
      <p className="product-card-meta" style={{ marginBottom: 14 }}>
        Every listing here is bulk-only — buyers must order at least the MOQ shown, or request a quote for a custom quantity.
      </p>

      {products.map((p) => (
        <div key={p.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{p.title}</div>
            <div className="product-card-meta">
              MOQ {p.minimum_order_quantity} units · {p.quantity_available} available · {p.currency} {Number(p.price).toLocaleString()}/unit
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => setTierProduct(p)}>Pricing tiers</button>
            <button className="btn-secondary" onClick={() => setCertProduct(p)}>Certificates</button>
          </div>
        </div>
      ))}

      {tierProduct && <TierEditor product={tierProduct} onClose={() => setTierProduct(null)} />}
      {certProduct && <CertificateEditor product={certProduct} onClose={() => setCertProduct(null)} />}
    </div>
  );
}
