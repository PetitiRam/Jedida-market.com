import { useEffect, useState } from 'react';
import client from '../../api/client';
import { CATEGORIES } from '../../constants/categories';

const STATUS_TABS = [
  { key: 'pending_review', label: 'Pending review' },
  { key: 'active', label: 'Active' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'paused', label: 'Paused' },
  { key: '', label: 'All' }
];

function ProductRow({ product, onApprove, onReject, onToggleFeature, onDelete, onError }) {
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(product.id); } catch { onError('Could not complete that action. Please retry.'); } finally { setBusy(false); }
  };

  return (
    <div className="card-surface" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
      <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--cream-dim)', flexShrink: 0, overflow: 'hidden' }}>
        {product.images?.[0] && <img src={product.images[0]} alt={product.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>{product.title}</strong>
          {product.is_featured && <span className="product-card-badge">Featured</span>}
        </div>
        <div className="product-card-meta">
          {product.shop_name} · {product.currency} {Number(product.price).toLocaleString()} · {product.category?.replace('_', ' ')}
        </div>
        <div className="product-card-meta">{product.views_count} views · {product.orders_count} orders</div>
      </div>

      <span className={`status-chip status-${product.status}`}>{product.status.replace('_', ' ')}</span>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {product.status === 'pending_review' && (
          <>
            <button className="btn-primary" style={{ width: 'auto', padding: '7px 14px' }} disabled={busy} onClick={() => run(onApprove)}>Approve</button>
            <button className="btn-secondary" disabled={busy} onClick={() => run(onReject)}>Reject</button>
          </>
        )}
        {product.status === 'active' && (
          <button className="btn-secondary" disabled={busy} onClick={() => run(onToggleFeature)}>
            {product.is_featured ? 'Unfeature' : 'Feature'}
          </button>
        )}
        <button className="btn-link" disabled={busy} onClick={() => { if (confirm('Remove this listing permanently?')) run(onDelete); }}>Remove</button>
      </div>
    </div>
  );
}

export default function AdminProductsPanel() {
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      if (statusFilter === 'pending_review') {
        const { data } = await client.get('/admin/products/pending');
        setProducts(data.products || []);
        setTotal((data.products || []).length);
      } else {
        const { data } = await client.get('/admin/products', {
          params: { status: statusFilter || undefined, category: category || undefined, search: search || undefined, page, pageSize: 50 }
        });
        setProducts(data.products || []);
        setTotal(data.total || 0);
      }
    } catch {
      setError('Could not load products. Check your connection and try again.');
      setProducts([]);
    }
  };
  useEffect(() => { load(); }, [statusFilter, category, page]);
  useEffect(() => {
    if (statusFilter === 'pending_review') return;
    const t = setTimeout(() => { setPage(1); load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const approve = (id) => client.post(`/admin/products/${id}/review`, { decision: 'approve' }).then(load);
  const reject = (id) => {
    const reason = prompt('Reason for rejection (sent to the seller):');
    if (reason === null) return Promise.resolve();
    return client.post(`/admin/products/${id}/review`, { decision: 'reject', reason }).then(load);
  };
  const toggleFeature = (id) => client.patch(`/admin/products/${id}/feature`).then(load);
  const remove = (id) => client.delete(`/admin/products/${id}`).then(load);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      {error && (
        <div className="card-surface" style={{ marginBottom: 12, background: '#fef3f2', border: '1px solid #fda29b', color: '#b42318', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button className="btn-link" onClick={load}>Retry</button>
        </div>
      )}

      <div className="tab-scroll" style={{ marginBottom: 12 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-pill ${statusFilter === t.key ? 'tab-pill-active' : ''}`}
            onClick={() => { setStatusFilter(t.key); setPage(1); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {statusFilter !== 'pending_review' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
          <div className="field-group" style={{ maxWidth: 220 }}>
            <label>Filter by category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="field-group" style={{ maxWidth: 280 }}>
            <label>Search (title, shop)</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" />
          </div>
        </div>
      )}

      {products === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-surface" style={{ display: 'flex', gap: 14 }}>
              <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 8 }} />
              <div className="skeleton" style={{ height: 16, width: '50%' }} />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">No products in this view.</div>
      ) : (
        products.map((p) => (
          <ProductRow
            key={p.id} product={p}
            onApprove={approve} onReject={reject}
            onToggleFeature={toggleFeature} onDelete={remove}
            onError={setError}
          />
        ))
      )}

      {statusFilter !== 'pending_review' && products?.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span className="product-card-meta">{total} products total</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="product-card-meta">Page {page} of {totalPages}</span>
            <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
