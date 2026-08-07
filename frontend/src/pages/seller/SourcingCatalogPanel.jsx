import { useEffect, useState } from 'react';
import * as sourcingApi from '../../api/sourcingApi';

function ImportModal({ product, onClose, onImported }) {
  const [marginType, setMarginType] = useState('percent');
  const [marginValue, setMarginValue] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const basePrice = Number(product.wholesale_price ?? product.price);
  const previewPrice = marginType === 'fixed'
    ? basePrice + Number(marginValue || 0)
    : basePrice * (1 + Number(marginValue || 0) / 100);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await sourcingApi.importProduct(product.id, marginType, Number(marginValue));
      onImported();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not import this product.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,22,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 420, width: '100%', padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>Import "{product.title}"</h3>
        <p style={{ color: '#5B6760', fontSize: 14 }}>
          Base price: {product.currency} {basePrice.toLocaleString()} {product.wholesale_price ? '(wholesale)' : ''}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select value={marginType} onChange={(e) => setMarginType(e.target.value)} style={{ flex: 1 }}>
            <option value="percent">Margin %</option>
            <option value="fixed">Fixed markup</option>
          </select>
          <input
            type="number"
            value={marginValue}
            onChange={(e) => setMarginValue(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <p style={{ fontWeight: 600 }}>
          Your selling price: {product.currency} {previewPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        {error && <div className="apf-error-text">{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Importing…' : 'Import Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SourcingCatalogPanel() {
  const [products, setProducts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [importTarget, setImportTarget] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [catalogRes, connRes] = await Promise.all([
        sourcingApi.browseCatalog({ search: search || undefined }),
        sourcingApi.myConnections(),
      ]);
      setProducts(catalogRes.data.products || []);
      setConnections(connRes.data.connections || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async (partnerId) => {
    try {
      await sourcingApi.requestConnection(partnerId, 'Interested in sourcing your products.');
      setMessage('Connection request sent.');
      load();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Could not send connection request.');
    }
  };

  if (loading) return <div className="empty-state">Loading the sourcing catalog…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Search wholesale products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          style={{ flex: 1 }}
        />
        <button className="btn-secondary" onClick={load}>Search</button>
      </div>

      {message && <div className="empty-state" style={{ marginBottom: 12 }}>{message}</div>}

      {products.length === 0 ? (
        <div className="empty-state">No wholesale products found yet.</div>
      ) : (
        <div className="product-grid">
          {products.map((p) => (
            <div className="product-card" key={p.id}>
              <div className="product-card-image">
                <img
                  src={Array.isArray(p.images) && p.images[0] ? p.images[0] : '/placeholder-product.png'}
                  alt={p.title}
                  onError={(e) => { e.currentTarget.src = '/placeholder-product.png'; }}
                />
              </div>
              <div className="product-card-body">
                <div className="product-card-title">{p.title}</div>
                <div className="product-card-meta">{p.company_name || p.shop_name} · {p.business_type}</div>
                <div className="product-card-price">
                  {p.currency} {Number(p.wholesale_price ?? p.price).toLocaleString()}
                  {p.minimum_order_quantity > 1 && <span> (min {p.minimum_order_quantity})</span>}
                </div>
                {p.connection_status === 'accepted' ? (
                  <button className="btn-primary" style={{ marginTop: 6 }} onClick={() => setImportTarget(p)}>
                    Import
                  </button>
                ) : p.connection_status === 'pending' ? (
                  <button className="btn-secondary" style={{ marginTop: 6 }} disabled>
                    Connection pending
                  </button>
                ) : (
                  <button className="btn-secondary" style={{ marginTop: 6 }} onClick={() => connect(p.business_user_id)}>
                    Request Connection
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 32 }}>My Connections</h3>
      {connections.length === 0 ? (
        <div className="empty-state">No connections yet — request one from a catalog item above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connections.map((c) => {
            const isRequester = c.requester_username && c.requester_role;
            const otherLabel = `${c.partner_username} (${c.partner_role})`;
            return (
              <div key={c.id} className="empty-state" style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                <span>{otherLabel} — <strong>{c.status}</strong></span>
                {c.status === 'pending' && (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary" onClick={async () => { await sourcingApi.respondConnection(c.id, 'accepted'); load(); }}>Accept</button>
                    <button className="btn-secondary" onClick={async () => { await sourcingApi.respondConnection(c.id, 'declined'); load(); }}>Decline</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {importTarget && (
        <ImportModal
          product={importTarget}
          onClose={() => setImportTarget(null)}
          onImported={() => { setImportTarget(null); setMessage('Product imported — check My Imports.'); load(); }}
        />
      )}
    </div>
  );
}
