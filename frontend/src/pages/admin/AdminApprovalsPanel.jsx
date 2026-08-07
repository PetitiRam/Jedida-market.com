import { useEffect, useState } from 'react';
import client from '../../api/client';

function Section({ title, items, renderItem, emptyText }) {
  if (items === null) return <div className="empty-state">Loading…</div>;
  return (
    <div style={{ marginBottom: 28 }}>
      <h4>{title}</h4>
      {items.length === 0 ? <div className="empty-state">{emptyText}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{items.map(renderItem)}</div>
      )}
    </div>
  );
}

export default function AdminApprovalsPanel() {
  const [shops, setShops] = useState(null);
  const [products, setProducts] = useState(null);

  const load = async () => {
    client.get('/admin/shops/pending').then(({ data }) => setShops(data.shops));
    client.get('/admin/products/pending').then(({ data }) => setProducts(data.products));
  };
  useEffect(() => { load(); }, []);

  const reviewShop = async (id, decision) => { await client.post(`/admin/shops/${id}/review`, { decision }); load(); };
  const reviewProduct = async (id, decision) => { await client.post(`/admin/products/${id}/review`, { decision }); load(); };

  return (
    <div>
      <Section title="Pending shops" items={shops} emptyText="No shops awaiting approval."
        renderItem={(s) => (
          <div className="card-surface" key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div><strong>{s.name}</strong><div className="product-card-meta">{s.primary_category}</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => reviewShop(s.id, 'approve')}>Approve</button>
              <button className="btn-secondary" onClick={() => reviewShop(s.id, 'reject')}>Reject</button>
            </div>
          </div>
        )} />

      <Section title="Pending product listings" items={products} emptyText="No listings awaiting approval."
        renderItem={(p) => (
          <div className="card-surface" key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div><strong>{p.title}</strong><div className="product-card-meta">{p.shop_name} · {p.currency} {p.price}</div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => reviewProduct(p.id, 'approve')}>Approve</button>
              <button className="btn-secondary" onClick={() => reviewProduct(p.id, 'reject')}>Reject</button>
            </div>
          </div>
        )} />

      <div className="empty-state" style={{ textAlign: 'left', background: 'var(--cream-dim)', borderRadius: 10, padding: 16 }}>
        Role upgrade requests (payment verification, KYC review, final approval) now live in their own <strong>Upgrades</strong> tab.
      </div>
    </div>
  );
}
