import { useEffect, useState } from 'react';
import * as dropshipApi from '../../api/dropshipApi';

const COMMISSION_LABELS = { pending: 'Pending release', released: 'Released', reversed: 'Reversed' };

export default function DropshipSalesPanel() {
  const [orders, setOrders] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dropshipApi.salesDashboard().then(({ data }) => {
      setOrders(data.orders || []);
      setPerformance(data.performance || null);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state">Loading your sales dashboard…</div>;

  return (
    <div>
      {performance && (
        <div className="card-surface" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div className="product-card-meta">Performance score</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{Number(performance.dropship_performance_score).toFixed(1)}<span style={{ fontSize: '0.9rem', fontWeight: 400 }}>/100</span></div>
            </div>
            <div>
              <div className="product-card-meta">Total orders</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{performance.dropship_total_orders}</div>
            </div>
            <div>
              <div className="product-card-meta">Completed</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{performance.dropship_completed_orders}</div>
            </div>
            <div>
              <div className="product-card-meta">Total sales</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{Number(performance.dropship_total_sales_amount).toLocaleString()}</div>
            </div>
            <div>
              <div className="product-card-meta">Commission earned</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{Number(performance.dropship_total_commission_earned).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {orders.length === 0 && <div className="empty-state">No dropship sales yet — share your resale links to get started.</div>}

      {orders.map((o) => (
        <div key={o.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{o.product_title}</div>
              <div className="product-card-meta">
                {new Date(o.created_at).toLocaleDateString()} · Order status: {o.status} · {o.currency} {Number(o.total_amount).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700 }}>{o.currency} {Number(o.commission_amount || 0).toLocaleString()}</div>
              <span className="product-card-badge">{COMMISSION_LABELS[o.commission_status] || 'N/A'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
