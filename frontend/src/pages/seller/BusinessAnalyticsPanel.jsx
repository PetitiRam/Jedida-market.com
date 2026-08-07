import { useEffect, useState } from 'react';
import * as b2bApi from '../../api/b2bApi';

function StatCard({ label, value }) {
  return (
    <div className="card-surface" style={{ flex: '1 1 160px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--forest)' }}>{value}</div>
      <div className="product-card-meta">{label}</div>
    </div>
  );
}

export default function BusinessAnalyticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    b2bApi.getBusinessAnalytics().then(({ data }) => setData(data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state">Loading analytics…</div>;
  if (!data) return <div className="empty-state">No analytics available yet.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Bulk orders" value={data.orders.count} />
        <StatCard label="Revenue" value={data.orders.revenue.toLocaleString()} />
        <StatCard label="Avg order qty" value={Math.round(data.orders.avgOrderQuantity)} />
        <StatCard label="Quote conversion" value={`${data.quotes.conversionRate}%`} />
        <StatCard label="Active listings" value={data.catalog.activeListings} />
        <StatCard label="Units in stock" value={data.catalog.totalUnitsAvailable} />
      </div>

      <h4 style={{ marginBottom: 8 }}>Top products</h4>
      {data.topProducts.length === 0 ? (
        <div className="empty-state">No orders yet.</div>
      ) : (
        data.topProducts.map((p) => (
          <div key={p.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>{p.title}</span>
            <span className="product-card-meta">{p.orders_count} bulk orders · MOQ {p.minimum_order_quantity}</span>
          </div>
        ))
      )}

      <h4 style={{ margin: '20px 0 8px' }}>Quote requests</h4>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {Object.entries(data.quotes.byStatus).map(([status, count]) => (
          <span key={status} className="product-card-badge">{status}: {count}</span>
        ))}
        {data.quotes.total === 0 && <span className="product-card-meta">No quote requests yet.</span>}
      </div>
    </div>
  );
}
