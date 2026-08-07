import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function AdminShopsPanel() {
  const [shops, setShops] = useState(null);

  const load = () => client.get('/admin/shops/pending').then(({ data }) => setShops(data.shops));
  useEffect(() => { load(); }, []);

  const review = (id, decision) => client.post(`/admin/shops/${id}/review`, { decision }).then(load);

  if (shops === null) return <div className="empty-state">Loading pending shops…</div>;
  if (shops.length === 0) return <div className="empty-state">No shops awaiting approval.</div>;

  return (
    <div>
      {shops.map((s) => (
        <div className="card-surface" key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, 
marginBottom: 10 }}>
          <div>
            <strong>{s.name}</strong>
            <div className="product-card-meta">{s.primary_category?.replace('_', ' ')} · {s.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => review(s.id, 'approve')}>Approve</button>
            <button className="btn-secondary" onClick={() => review(s.id, 'reject')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
