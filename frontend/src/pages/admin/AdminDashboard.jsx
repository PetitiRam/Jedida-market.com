import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import MissionControlDashboard from './MissionControlDashboard';
import '../../styles/admin-dashboard.css';

function money(n) {
  return `UGX ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function ChangeBadge({ value }) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const up = value >= 0;
  return (
    <span className={`adm-change ${up ? 'adm-change-up' : 'adm-change-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}% <span className="adm-change-label">from last month</span>
    </span>
  );
}

function StatCard({ icon, label, value, change, tone }) {
  return (
    <div className="card-surface adm-stat-card">
      <div className={`adm-stat-icon adm-tone-${tone}`}>{icon}</div>
      <div>
        <div className="adm-stat-label">{label}</div>
        <div className="adm-stat-value">{value}</div>
        <ChangeBadge value={change} />
      </div>
    </div>
  );
}

// Lightweight dependency-free line chart — orders vs revenue over the trailing window.
function OrdersLineChart({ data }) {
  const width = 560, height = 190, padX = 8, padY = 16;
  const points = data.length ? data : [{ orders: 0, revenue: 0 }];
  const maxOrders = Math.max(1, ...points.map((p) => p.orders));
  const maxRevenue = Math.max(1, ...points.map((p) => p.revenue));
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  const toPath = (key, max) => points
    .map((p, i) => {
      const x = padX + i * stepX;
      const y = height - padY - (p[key] / max) * (height - padY * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="adm-linechart" preserveAspectRatio="none">
      <path d={toPath('orders', maxOrders)} fill="none" stroke="#8BC53F" strokeWidth="2.5" />
      <path d={toPath('revenue', maxRevenue)} fill="none" stroke="#0B3D24" strokeWidth="2.5" />
    </svg>
  );
}

// Dependency-free donut chart for order status breakdown.
function StatusDonut({ segments, total }) {
  const size = 150, stroke = 20, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="adm-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((s) => {
            const frac = total ? s.count / total : 0;
            const dash = frac * c;
            const el = (
              <circle
                key={s.status}
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
      </svg>
      <div className="adm-donut-center">
        <div className="adm-donut-total">{total.toLocaleString()}</div>
        <div className="adm-donut-sublabel">Total Orders</div>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  completed: '#2E9B5C', delivered_confirmed: '#2E9B5C',
  shipped: '#3D7FE0', paid_escrow: '#8BC53F', pending_payment: '#8BC53F',
  cancelled: '#B8AE93', disputed: '#2E7D32',
};

// Which cards/sections each admin sub-role sees, mapped onto the areas
// already defined in AdminPanel's ROLE_AREAS — narrower roles get a
// smaller, honest slice of the same real data rather than a different UI.
function roleLayout(role) {
  const full = { title: 'Admin Dashboard', subtitle: 'Overview of marketplace operations', cards: ['users', 'sellers', 'orders', 'revenue'], showChart: true, showCategories: true, showApprovals: true, showAlerts: true, showRegistrations: true };
  if (!role || role === 'super_admin') {
    return { ...full, title: 'Super Admin Dashboard', subtitle: 'Overview of the entire marketplace' };
  }
  switch (role) {
    case 'staff':
      return { title: 'Staff Dashboard', subtitle: 'Handle daily operations and tasks', cards: ['orders', 'pendingProducts', 'lowStock', 'disputed'], showChart: true, showCategories: true, showApprovals: false, showAlerts: true, showRegistrations: false };
    case 'moderator':
      return { title: 'Moderator Dashboard', subtitle: 'Review shops and product listings', cards: ['pendingProducts', 'pendingShops', 'sellers', 'lowStock'], showChart: false, showCategories: true, showApprovals: true, showAlerts: false, showRegistrations: true };
    case 'support':
      return { title: 'Support Dashboard', subtitle: 'Customer support and account issues', cards: ['users', 'disputed', 'orders', 'pendingProducts'], showChart: false, showCategories: false, showApprovals: false, showAlerts: true, showRegistrations: true };
    case 'finance':
      return { title: 'Finance Dashboard', subtitle: 'Payouts, withdrawals and revenue', cards: ['revenue', 'pendingWithdrawals', 'orders', 'sellers'], showChart: true, showCategories: false, showApprovals: true, showAlerts: false, showRegistrations: false };
    case 'marketing':
      return { title: 'Marketing Dashboard', subtitle: 'Ads, campaigns and reach', cards: ['sellers', 'orders', 'users', 'revenue'], showChart: true, showCategories: true, showApprovals: false, showAlerts: false, showRegistrations: false };
    case 'approvals':
      return { title: 'Approvals Dashboard', subtitle: 'Everything waiting on a decision', cards: ['pendingProducts', 'pendingShops', 'pendingWithdrawals', 'lowStock'], showChart: false, showCategories: true, showApprovals: true, showAlerts: true, showRegistrations: false };
    case 'ai_manager':
    case 'chat_assistant':
      return { title: 'Dashboard', subtitle: 'AI & chat operations overview', cards: ['orders', 'users', 'disputed', 'sellers'], showChart: false, showCategories: false, showApprovals: false, showAlerts: true, showRegistrations: true };
    default:
      return full;
  }
}

const CARD_DEFS = {
  users: (d) => ({ icon: '👤', label: 'Total Users', value: d.stats.users.total.toLocaleString(), change: d.stats.users.change, tone: 'green' }),
  sellers: (d) => ({ icon: '🏪', label: 'Total Sellers', value: d.stats.sellers.total.toLocaleString(), change: d.stats.sellers.change, tone: 'purple' }),
  orders: (d) => ({ icon: '📦', label: 'Total Orders', value: d.stats.orders.total.toLocaleString(), change: d.stats.orders.change, tone: 'amber' }),
  revenue: (d) => ({ icon: '💰', label: 'Revenue (30d)', value: money(d.stats.revenue.total), change: d.stats.revenue.change, tone: 'blue' }),
  pendingProducts: (d) => ({ icon: '📝', label: 'Pending Product Reviews', value: d.pendingApprovals.products.toLocaleString(), change: null, tone: 'amber' }),
  pendingShops: (d) => ({ icon: '🏬', label: 'Pending Shop Approvals', value: d.pendingApprovals.shops.toLocaleString(), change: null, tone: 'purple' }),
  pendingWithdrawals: (d) => ({ icon: '💸', label: 'Pending Withdrawals', value: d.pendingApprovals.withdrawals.toLocaleString(), change: null, tone: 'blue' }),
  lowStock: (d) => ({ icon: '📉', label: 'Low Stock Products', value: d.systemAlerts.lowStock.toLocaleString(), change: null, tone: 'amber' }),
  disputed: (d) => ({ icon: '⚠️', label: 'Disputed Orders', value: d.systemAlerts.disputedOrders.toLocaleString(), change: null, tone: 'green' }),
};

function ScopedAdminDashboard({ adminRole }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    client.get('/admin/dashboard-summary')
      .then(({ data }) => { if (alive) setData(data); })
      .catch((err) => { if (alive) setError(err?.response?.data?.error || 'Could not load dashboard data.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const layout = useMemo(() => roleLayout(adminRole), [adminRole]);

  if (loading) return <div className="card-surface" style={{ padding: 32 }}>Loading dashboard…</div>;
  if (error) return <div className="card-surface" style={{ padding: 32, color: '#2E7D32' }}>{error}</div>;
  if (!data) return null;

  const totalOrdersForDonut = data.ordersByStatus.reduce((s, r) => s + r.count, 0);
  const donutSegments = data.ordersByStatus.map((s) => ({ ...s, color: STATUS_COLORS[s.status] || '#8A9189' }));

  return (
    <div className="adm-dash">
      <div className="adm-dash-topline">
        <div>
          <h2 className="adm-dash-title">
            {layout.title} <span className="adm-verified" title="Verified admin session">✔</span>
          </h2>
          <p className="adm-dash-subtitle">{layout.subtitle}</p>
        </div>
        <div className="adm-dash-actions">
          <span className="adm-range">Last 30 days</span>
          <button type="button" className="btn-secondary" onClick={() => window.print()}>Export</button>
        </div>
      </div>

      <div className="adm-stat-grid">
        {layout.cards.map((key) => {
          const def = CARD_DEFS[key];
          if (!def) return null;
          const card = def(data);
          return <StatCard key={key} {...card} />;
        })}
      </div>

      {(layout.showChart || layout.showCategories) && (
        <div className="adm-grid-2">
          {layout.showChart && (
            <div className="card-surface adm-panel">
              <div className="adm-panel-head">
                <h3>Orders Overview</h3>
                <div className="adm-legend">
                  <span><i className="adm-dot" style={{ background: '#8BC53F' }} /> Orders</span>
                  <span><i className="adm-dot" style={{ background: '#0B3D24' }} /> Revenue</span>
                </div>
              </div>
              <OrdersLineChart data={data.ordersOverview} />
            </div>
          )}
          {layout.showChart && (
            <div className="card-surface adm-panel adm-panel-donut">
              <h3>Orders by Status</h3>
              <StatusDonut segments={donutSegments} total={totalOrdersForDonut} />
              <ul className="adm-status-legend">
                {donutSegments.map((s) => (
                  <li key={s.status}>
                    <span><i className="adm-dot" style={{ background: s.color }} /> {s.status.replace(/_/g, ' ')}</span>
                    <strong>{totalOrdersForDonut ? Math.round((s.count / totalOrdersForDonut) * 100) : 0}%</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!layout.showChart && layout.showCategories && (
            <div className="card-surface adm-panel">
              <h3>Top Categories</h3>
              <ul className="adm-bar-list">
                {data.topCategories.map((c) => (
                  <li key={c.category}>
                    <div className="adm-bar-row">
                      <span>{c.category.replace(/_/g, ' ')}</span>
                      <strong>{c.percent}%</strong>
                    </div>
                    <div className="adm-bar-track"><div className="adm-bar-fill" style={{ width: `${c.percent}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {layout.showChart && layout.showCategories && (
        <div className="card-surface adm-panel">
          <h3>Top Categories</h3>
          <ul className="adm-bar-list">
            {data.topCategories.map((c) => (
              <li key={c.category}>
                <div className="adm-bar-row">
                  <span>{c.category.replace(/_/g, ' ')}</span>
                  <strong>{c.percent}%</strong>
                </div>
                <div className="adm-bar-track"><div className="adm-bar-fill" style={{ width: `${c.percent}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="adm-grid-2">
        <div className="card-surface adm-panel">
          <div className="adm-panel-head">
            <h3>Recent Orders</h3>
          </div>
          <ul className="adm-list">
            {data.recentOrders.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>#{o.id.slice(0, 8)}</strong>
                  <div className="adm-list-sub">{o.buyerName} · {timeAgo(o.createdAt)}</div>
                </div>
                <div className="adm-list-right">
                  <div>{o.currency} {Number(o.amount).toLocaleString()}</div>
                  <span className={`status-chip status-${o.status === 'delivered_confirmed' || o.status === 'completed' ? 'active' : 'pending'}`}>
                    {o.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </li>
            ))}
            {!data.recentOrders.length && <li className="adm-empty">No orders yet.</li>}
          </ul>
        </div>

        <div className="card-surface adm-panel">
          <h3>{layout.showApprovals ? 'Pending Approvals' : layout.showRegistrations ? 'Recent Registrations' : 'System Alerts'}</h3>
          {layout.showApprovals && (
            <ul className="adm-approvals">
              <li><span>Shop applications</span><strong>{data.pendingApprovals.shops}</strong></li>
              <li><span>Product listings</span><strong>{data.pendingApprovals.products}</strong></li>
              <li><span>Role upgrades</span><strong>{data.pendingApprovals.upgrades}</strong></li>
              <li><span>Withdrawals</span><strong>{data.pendingApprovals.withdrawals}</strong></li>
            </ul>
          )}
          {!layout.showApprovals && layout.showRegistrations && (
            <ul className="adm-list">
              {data.recentRegistrations.map((u) => (
                <li key={u.id}>
                  <div>
                    <strong>{u.fullName}</strong>
                    <div className="adm-list-sub">{u.role} · {timeAgo(u.createdAt)}</div>
                  </div>
                </li>
              ))}
              {!data.recentRegistrations.length && <li className="adm-empty">No recent sign-ups.</li>}
            </ul>
          )}
          {!layout.showApprovals && !layout.showRegistrations && (
            <ul className="adm-approvals">
              <li><span>Low stock products</span><strong>{data.systemAlerts.lowStock}</strong></li>
              <li><span>Disputed orders</span><strong>{data.systemAlerts.disputedOrders}</strong></li>
            </ul>
          )}
        </div>
      </div>

      {layout.showAlerts && (
        <div className="card-surface adm-panel">
          <div className="adm-panel-head"><h3>System Alerts</h3></div>
          <div className="adm-alert-row">
            <div className="adm-alert-pill"><strong>{data.systemAlerts.lowStock}</strong> Low stock products</div>
            <div className="adm-alert-pill"><strong>{data.systemAlerts.disputedOrders}</strong> Disputed orders</div>
            <div className="adm-alert-pill"><strong>{data.pendingApprovals.upgrades}</strong> Pending role upgrades</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Full-access roles (super_admin / legacy null admin_role) land on the
// redesigned Mission Control screen; narrower admin_role users keep the
// existing role-scoped dashboard above, which already tailors its cards
// per role. Two separate function bodies (rather than an early return
// inside one component) so neither one ever calls hooks conditionally.
export default function AdminDashboard({ adminRole, adminName }) {
  const isFullAccess = !adminRole || adminRole === 'super_admin';
  if (isFullAccess) return <MissionControlDashboard adminName={adminName} />;
  return <ScopedAdminDashboard adminRole={adminRole} />;
}
