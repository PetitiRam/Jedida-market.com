import { useEffect, useMemo, useRef, useState } from 'react';
import client from '../../api/client';
import Icon from '../../components/icons/icon';
import ThemeToggle from '../../components/ThemeToggle';
import '../../styles/mission-control.css';

const REFRESH_MS = 60000; // Mission Control quietly re-pulls live data every minute.

function money(n, currency = 'UGX') {
  return `${currency} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function formatUptime(seconds) {
  const s = Number(seconds) || 0;
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const ACTIVITY_ICON = {
  order: { icon: 'cart', tone: 'mc-tone-blue' },
  security: { icon: 'shield', tone: 'mc-tone-red' },
  verification: { icon: 'checkShield', tone: 'mc-tone-green' },
  finance: { icon: 'bank', tone: 'mc-tone-purple' },
  marketing: { icon: 'sparkle', tone: 'mc-tone-amber' },
};

const STATUS_COLORS = {
  completed: '#8BC53F', delivered_confirmed: '#8BC53F',
  shipped: '#3D7FE0', paid_escrow: '#6FA82E', pending_payment: '#C88A1E',
  cancelled: '#8A9189', disputed: '#C24444',
};

function KpiCard({ icon, tone, label, value, change, hint }) {
  return (
    <div className="mc-glass mc-kpi-card">
      <div className="mc-kpi-top">
        <div className={`mc-kpi-icon ${tone}`}><Icon name={icon} size={18} /></div>
        {change !== undefined && change !== null && (
          <span className={`mc-kpi-change ${change > 0 ? 'mc-kpi-up' : change < 0 ? 'mc-kpi-down' : 'mc-kpi-neutral'}`}>
            {change > 0 ? '▲' : change < 0 ? '▼' : '—'} {Math.abs(change)}%
          </span>
        )}
      </div>
      <div className="mc-kpi-label">{label}</div>
      <div className="mc-kpi-value">{value}</div>
      {hint && <div className="mc-kpi-change mc-kpi-neutral">{hint}</div>}
    </div>
  );
}

function RevenueChart({ data }) {
  const width = 560, height = 150, padX = 6, padY = 14;
  const points = data.length ? data : [{ orders: 0, revenue: 0 }];
  const maxOrders = Math.max(1, ...points.map((p) => p.orders));
  const maxRevenue = Math.max(1, ...points.map((p) => p.revenue));
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const toPath = (key, max) => points.map((p, i) => {
    const x = padX + i * stepX;
    const y = height - padY - (p[key] / max) * (height - padY * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const revenuePath = toPath('revenue', maxRevenue);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mc-linechart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="mcRevFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8BC53F" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8BC53F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${revenuePath} L${width - padX},${height} L${padX},${height} Z`} fill="url(#mcRevFill)" />
      <path d={revenuePath} fill="none" stroke="#0B3D24" strokeWidth="2.5" strokeLinecap="round" />
      <path d={toPath('orders', maxOrders)} fill="none" stroke="#3D7FE0" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
    </svg>
  );
}

function StatusDonut({ segments, total }) {
  const size = 140, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="mc-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((s) => {
            const frac = total ? s.count / total : 0;
            const dash = frac * c;
            const el = (
              <circle key={s.status} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={s.color} strokeWidth={stroke} strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset} strokeLinecap="butt" />
            );
            offset += dash;
            return el;
          })}
        </g>
      </svg>
      <div className="mc-donut-center">
        <div className="mc-donut-total">{total.toLocaleString()}</div>
        <div className="mc-donut-sub">orders</div>
      </div>
    </div>
  );
}

function ThreatGauge({ score, level }) {
  const size = 108, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * c;
  const color = score >= 70 ? '#C24444' : score >= 40 ? '#C88A1E' : score >= 15 ? '#3D7FE0' : '#8BC53F';
  return (
    <div className="mc-gauge-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--mc-border)" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
        </g>
      </svg>
      <div className="mc-gauge-center">
        <span className="mc-gauge-score">{score}</span>
        <span className={`mc-gauge-label mc-level-${level}`}>{level}</span>
      </div>
    </div>
  );
}

export default function MissionControlDashboard({ adminName }) {
  const [data, setData] = useState(null);
  const [security, setSecurity] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const alive = useRef(true);

  const load = async (isBackground) => {
    if (isBackground) setRefreshing(true);
    try {
      const [mcRes, secRes] = await Promise.all([
        client.get('/admin/mission-control'),
        client.get('/admin/security-ops/overview').catch(() => ({ data: null })),
      ]);
      if (!alive.current) return;
      setData(mcRes.data);
      setSecurity(secRes.data);
      setError(null);
    } catch (err) {
      if (alive.current) setError(err?.response?.data?.error || 'Could not load Mission Control data.');
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
  };

  useEffect(() => {
    alive.current = true;
    load(false);
    const poll = setInterval(() => load(true), REFRESH_MS);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { alive.current = false; clearInterval(poll); clearInterval(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (message, isError) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3500);
  };

  const toggleMaintenance = async () => {
    if (!data) return;
    const next = !data.maintenance?.maintenanceMode;
    if (!window.confirm(next
      ? 'Turn ON maintenance mode? Buyers and sellers will see a maintenance notice site-wide.'
      : 'Turn OFF maintenance mode?')) return;
    setBusyAction('maintenance');
    try {
      const { data: res } = await client.patch('/admin/settings-center/section/maintenance', {
        maintenanceMode: next,
        maintenanceMessage: data.maintenance?.maintenanceMessage || 'Jedida Market is undergoing scheduled maintenance.',
      });
      setData((d) => ({ ...d, maintenance: res.value || { ...d.maintenance, maintenanceMode: next } }));
      showToast(next ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
    } catch (err) {
      showToast(err?.response?.data?.error || 'Could not update maintenance mode.', true);
    } finally {
      setBusyAction(null);
    }
  };

  const EMERGENCY_LABELS = {
    paymentsFrozen: 'Freeze payments',
    partnerApisDisabled: 'Disable partner APIs',
    loginDisabled: 'Disable login (non-admins)',
    withdrawalsFrozen: 'Freeze withdrawals',
  };
  const toggleEmergencyFlag = async (flag) => {
    if (!data) return;
    const next = !data.emergencyControls?.[flag];
    if (!window.confirm(`${next ? 'Enable' : 'Disable'} "${EMERGENCY_LABELS[flag]}" platform-wide?`)) return;
    setBusyAction(flag);
    try {
      const { data: res } = await client.patch('/admin/settings-center/section/emergency', { [flag]: next });
      setData((d) => ({ ...d, emergencyControls: res.value || { ...d.emergencyControls, [flag]: next } }));
      showToast(`${EMERGENCY_LABELS[flag]} ${next ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      showToast(err?.response?.data?.error || `Could not update ${EMERGENCY_LABELS[flag].toLowerCase()}.`, true);
    } finally {
      setBusyAction(null);
    }
  };

  const forceLogoutAll = async () => {
    if (!window.confirm('This immediately signs out every user on every device platform-wide. Continue?')) return;
    setBusyAction('logout');
    try {
      await client.post('/admin/security/force-logout-all');
      showToast('All sessions revoked platform-wide.');
    } catch (err) {
      showToast(err?.response?.data?.error || 'Could not force logout.', true);
    } finally {
      setBusyAction(null);
    }
  };

  const donutSegments = useMemo(() => {
    if (!data) return [];
    return data.charts.ordersByStatus.map((s) => ({ ...s, color: STATUS_COLORS[s.status] || '#8A9189' }));
  }, [data]);
  const donutTotal = useMemo(() => donutSegments.reduce((s, r) => s + r.count, 0), [donutSegments]);

  if (loading) {
    return (
      <div className="mc-root">
        <div className="mc-loading-grid">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="mc-skeleton" />)}
        </div>
      </div>
    );
  }
  if (error) return <div className="mc-root"><div className="mc-glass mc-panel" style={{ color: '#C24444' }}>{error}</div></div>;
  if (!data) return null;

  const k = data.kpis;

  return (
    <div className="mc-root">
      {/* Top bar */}
      <div className="mc-glass mc-topbar">
        <div className="mc-topbar-left">
          <span className="mc-live-dot" title="Live" />
          <div className="mc-topbar-title">
            <h2>Mission Control</h2>
            <span className="mc-topbar-sub">
              {refreshing ? 'Refreshing…' : `Updated ${timeAgo(data.generatedAt)}`} · DB {k.dbLatencyMs}ms
            </span>
          </div>
        </div>
        <div className="mc-topbar-right">
          <span className="mc-clock">{now.toLocaleTimeString()}</span>
          <ThemeToggle />
          <button type="button" className={`mc-icon-btn ${refreshing ? 'spinning' : ''}`} onClick={() => load(true)} title="Refresh now">
            <Icon name="refresh" size={17} />
          </button>
          <button type="button" className="mc-btn" onClick={() => window.print()}>Export</button>
        </div>
      </div>

      {/* Welcome / health strip */}
      <div className="mc-glass mc-welcome">
        <div className="mc-welcome-text">
          <h1>Welcome back{adminName ? `, ${adminName.split(' ')[0]}` : ''} 👋</h1>
          <p>Here's the live state of Jedida Market right now.</p>
        </div>
        <div className="mc-welcome-metrics">
          <div className="mc-welcome-metric">
            <span className="n">{money(k.revenueToday)}</span>
            <span className="l">Revenue today</span>
          </div>
          <div className="mc-welcome-metric">
            <span className="n">{k.ordersToday.total}</span>
            <span className="l">Orders today</span>
          </div>
          <div className="mc-welcome-metric">
            <span className="n">{formatUptime(k.uptimeSeconds)}</span>
            <span className="l">Server uptime</span>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="mc-kpi-grid">
        <KpiCard icon="bank" tone="mc-tone-green" label="Revenue Today" value={money(k.revenueToday)} change={k.revenueChangeVsYesterday} />
        <KpiCard icon="check" tone="mc-tone-green" label="Completed Orders" value={k.ordersToday.completed} />
        <KpiCard icon="clock" tone="mc-tone-amber" label="Pending Orders" value={k.ordersToday.pending} />
        <KpiCard icon="x" tone="mc-tone-red" label="Cancelled Orders" value={k.ordersToday.cancelled} />
        <KpiCard icon="box" tone="mc-tone-blue" label="Products Online" value={k.productsOnline.toLocaleString()} />
        <KpiCard icon="document" tone="mc-tone-amber" label="Pending Products" value={k.productsPending.toLocaleString()} />
        <KpiCard icon="user" tone="mc-tone-purple" label="Customers" value={k.customers.toLocaleString()} />
        <KpiCard icon="briefcase" tone="mc-tone-purple" label="Sellers" value={k.sellers.toLocaleString()} />
        <KpiCard icon="checkShield" tone="mc-tone-green" label="Verified Shops" value={`${k.verifiedShops} / ${k.totalShops}`} />
        <KpiCard icon="truck" tone="mc-tone-blue" label="Deliveries In Progress" value={k.deliveriesInProgress.toLocaleString()} />
        <KpiCard icon="headset" tone="mc-tone-amber" label="Open Support Tickets" value={k.supportTicketsOpen.toLocaleString()} />
        <KpiCard icon="globe" tone="mc-tone-blue" label="API Requests Today" value={k.apiRequestsToday.toLocaleString()} hint={`${k.apiBlockedToday} blocked`} />
        <KpiCard icon="shield" tone="mc-tone-red" label="Threats Blocked (24h)" value={k.fraudAttemptsBlocked24h.toLocaleString()} />
        <KpiCard icon="card" tone="mc-tone-green" label="Payment Success Rate" value={k.paymentSuccessRate !== null ? `${k.paymentSuccessRate}%` : '—'} />
        <KpiCard icon="loader" tone="mc-tone-purple" label="Database Size" value={k.storageUsage} />
      </div>

      {/* Overview charts */}
      <div className="mc-row mc-row-3">
        <div className="mc-glass mc-panel">
          <div className="mc-panel-head">
            <h3>Revenue &amp; Orders (7d)</h3>
            <div className="mc-chart-legend">
              <span><i className="mc-dot" style={{ background: '#0B3D24' }} /> Revenue</span>
              <span><i className="mc-dot" style={{ background: '#3D7FE0' }} /> Orders</span>
            </div>
          </div>
          <RevenueChart data={data.charts.revenueTrend7d} />
        </div>
        <div className="mc-glass mc-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="mc-panel-head" style={{ width: '100%' }}><h3>Orders by Status</h3></div>
          <StatusDonut segments={donutSegments} total={donutTotal} />
          <ul className="mc-status-legend" style={{ width: '100%' }}>
            {donutSegments.map((s) => (
              <li key={s.status}>
                <span><i className="mc-dot" style={{ background: s.color }} /> {s.status.replace(/_/g, ' ')}</span>
                <strong>{donutTotal ? Math.round((s.count / donutTotal) * 100) : 0}%</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3>Top Categories</h3></div>
          <ul className="mc-bar-list">
            {data.charts.topCategories.map((c) => (
              <li key={c.category}>
                <div className="mc-bar-row"><span>{c.category.replace(/_/g, ' ')}</span><strong>{c.percent}%</strong></div>
                <div className="mc-bar-track"><div className="mc-bar-fill" style={{ width: `${c.percent}%` }} /></div>
              </li>
            ))}
            {!data.charts.topCategories.length && <li className="mc-empty">No product categories yet.</li>}
          </ul>
        </div>
      </div>

      {/* Security + AI insights */}
      <div className="mc-row mc-row-2">
        <div className="mc-glass mc-panel">
          <div className="mc-panel-head">
            <h3><Icon name="shield" size={16} /> Security Centre</h3>
            <span className="mc-panel-sub">Full detail in the Security Ops tab</span>
          </div>
          {security ? (
            <div className="mc-security-grid">
              <ThreatGauge score={security.threatScore.score} level={security.threatScore.level} />
              <div className="mc-security-stats">
                <div className="mc-security-stat"><div className="n">{security.blockedIps}</div><div className="l">Blocked IPs</div></div>
                <div className="mc-security-stat"><div className="n">{security.unresolvedAlerts}</div><div className="l">Unresolved alerts</div></div>
                <div className="mc-security-stat"><div className="n">{security.failedLogins.last_24h}</div><div className="l">Failed logins (24h)</div></div>
                <div className="mc-security-stat"><div className="n">{security.activeSessions.total}</div><div className="l">Active sessions</div></div>
                <div className="mc-security-stat"><div className="n">{security.liveAttacksBlocked.total24h}</div><div className="l">Attacks blocked (24h)</div></div>
                <div className="mc-security-stat"><div className="n">{security.malwareDetections7d}</div><div className="l">Malware detected (7d)</div></div>
              </div>
            </div>
          ) : <div className="mc-empty">Security overview unavailable.</div>}
        </div>

        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3><Icon name="sparkle" size={16} /> Petiti AI Insights</h3></div>
          <div className="mc-insight-grid" style={{ gridTemplateColumns: '1fr' }}>
            {data.insights.map((ins) => (
              <div key={ins.id} className={`mc-insight-card mc-insight-${ins.tone}`}>
                <div className="mc-insight-title">{ins.title}</div>
                <div className="mc-insight-body">{ins.body}</div>
                <div className="mc-insight-why">Why: {ins.why}</div>
              </div>
            ))}
            {!data.insights.length && <div className="mc-empty">No active recommendations — the marketplace looks healthy.</div>}
          </div>
        </div>
      </div>

      {/* Activity + Global reach */}
      <div className="mc-row mc-row-2">
        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3>Live Activity Feed</h3></div>
          <ul className="mc-list">
            {data.activity.map((a) => {
              const meta = ACTIVITY_ICON[a.type] || { icon: 'bell', tone: 'mc-tone-blue' };
              return (
                <li key={a.id} className="mc-list-item">
                  <div className={`mc-list-icon ${meta.tone}`}><Icon name={meta.icon} size={14} /></div>
                  <div className="mc-list-body">
                    <div className="mc-list-text">{a.text}</div>
                    {a.detail && <div className="mc-list-detail">{a.detail}</div>}
                  </div>
                  <div className="mc-list-time">{timeAgo(a.createdAt)}</div>
                </li>
              );
            })}
            {!data.activity.length && <li className="mc-empty">No recent activity.</li>}
          </ul>
        </div>

        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3><Icon name="globe" size={16} /> Global Reach</h3></div>
          {data.charts.topCountries.map((c) => (
            <div className="mc-country-row" key={c.country}>
              <span className="mc-country-name">{c.country}</span>
              <div className="mc-country-track"><div className="mc-country-fill" style={{ width: `${c.percent}%` }} /></div>
              <span className="mc-country-count">{c.count}</span>
            </div>
          ))}
          {!data.charts.topCountries.length && <div className="mc-empty">No user location data yet.</div>}
        </div>
      </div>

      {/* Finance + Top shops + Verified shops */}
      <div className="mc-row mc-row-3">
        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3><Icon name="bank" size={16} /> Finance Overview</h3></div>
          <div className="mc-stat-line"><span>Revenue today</span><strong>{money(data.finance.revenueToday)}</strong></div>
          <div className="mc-stat-line"><span>Est. commission ({data.finance.platformFeePercent}%)</span><strong>{money(data.finance.commissionEstimateToday)}</strong></div>
          <div className="mc-stat-line"><span>Escrow balance</span><strong>{money(data.finance.escrowBalance)}</strong></div>
          <div className="mc-stat-line"><span>Platform wallet</span><strong>{money(data.finance.platformBalance)}</strong></div>
          <div className="mc-stat-line"><span>Pending withdrawals</span><strong>{money(data.finance.pendingWithdrawals.total)} ({data.finance.pendingWithdrawals.count})</strong></div>
          <div className="mc-stat-line"><span>Refunds (30d)</span><strong>{money(data.finance.refunds30d.total)} ({data.finance.refunds30d.count})</strong></div>
        </div>

        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3>Top Performing Shops</h3></div>
          <ul className="mc-list" style={{ maxHeight: 260 }}>
            {data.charts.topShops.map((s, i) => (
              <li key={s.id} className="mc-list-item">
                <div className="mc-list-icon mc-tone-green" style={{ fontSize: '0.7rem', fontWeight: 800 }}>{i + 1}</div>
                <div className="mc-list-body">
                  <div className="mc-list-text">{s.name}</div>
                  <div className="mc-list-detail">{s.orders} orders</div>
                </div>
                <div className="mc-list-time" style={{ fontWeight: 700, color: 'var(--mc-text)' }}>{money(s.revenue)}</div>
              </li>
            ))}
            {!data.charts.topShops.length && <li className="mc-empty">No shop revenue yet.</li>}
          </ul>
        </div>

        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3><Icon name="checkShield" size={16} /> Verified Shops</h3></div>
          <div className="mc-stat-line"><span>Verified</span><strong>{data.verifiedShopsPanel.verifiedCount} / {data.verifiedShopsPanel.totalShops}</strong></div>
          <div className="mc-stat-line"><span>Close to verification (60-79 trust)</span><strong>{data.verifiedShopsPanel.nearVerificationCount}</strong></div>
          <ul className="mc-list" style={{ marginTop: 8 }}>
            {data.verifiedShopsPanel.recentlyVerified.map((s) => (
              <li key={s.id} className="mc-list-item">
                <div className="mc-list-icon mc-tone-green"><Icon name="checkShield" size={13} /></div>
                <div className="mc-list-body"><div className="mc-list-text">{s.name}</div></div>
                <div className="mc-list-time">{timeAgo(s.verifiedSince)}</div>
              </li>
            ))}
            {!data.verifiedShopsPanel.recentlyVerified.length && <li className="mc-empty">No verified shops yet.</li>}
          </ul>
        </div>
      </div>

      {/* Payment methods + Role distribution */}
      <div className="mc-row mc-row-2b">
        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3><Icon name="card" size={16} /> Payment Methods (30d)</h3></div>
          <ul className="mc-bar-list">
            {data.charts.paymentMethods.map((p) => (
              <li key={p.method}>
                <div className="mc-bar-row"><span>{p.method}</span><strong>{p.percent}%</strong></div>
                <div className="mc-bar-track"><div className="mc-bar-fill" style={{ width: `${p.percent}%` }} /></div>
              </li>
            ))}
            {!data.charts.paymentMethods.length && <li className="mc-empty">No successful payments in the last 30 days.</li>}
          </ul>
        </div>
        <div className="mc-glass mc-panel">
          <div className="mc-panel-head"><h3>Admin Role Distribution</h3></div>
          {data.roleDistribution.map((r) => (
            <div className="mc-stat-line" key={r.role}>
              <span style={{ textTransform: 'capitalize' }}>{r.role.replace(/_/g, ' ')}</span>
              <strong>{r.count}</strong>
            </div>
          ))}
          {!data.roleDistribution.length && <div className="mc-empty">No admin accounts found.</div>}
        </div>
      </div>

      {/* Emergency controls — super admin only, every action is real */}
      <div className="mc-glass mc-panel">
        <div className="mc-panel-head"><h3><Icon name="alertCircle" size={16} /> Emergency &amp; Quick Controls</h3></div>
        <div className="mc-controls-row">
          <span className={`mc-maintenance-status ${data.maintenance?.maintenanceMode ? 'mc-maintenance-on' : 'mc-maintenance-off'}`}>
            <Icon name={data.maintenance?.maintenanceMode ? 'lock' : 'checkCircle'} size={14} />
            Maintenance mode: {data.maintenance?.maintenanceMode ? 'ON' : 'OFF'}
          </span>
          <button type="button" className="mc-btn" disabled={busyAction === 'maintenance'} onClick={toggleMaintenance}>
            {data.maintenance?.maintenanceMode ? 'Turn off maintenance' : 'Turn on maintenance'}
          </button>
          {Object.keys(EMERGENCY_LABELS).map((flag) => (
            <button
              key={flag}
              type="button"
              className={`mc-btn ${data.emergencyControls?.[flag] ? 'mc-btn-danger' : ''}`}
              disabled={busyAction === flag}
              onClick={() => toggleEmergencyFlag(flag)}
            >
              {EMERGENCY_LABELS[flag]}: {data.emergencyControls?.[flag] ? 'ON' : 'off'}
            </button>
          ))}
          <button type="button" className="mc-btn mc-btn-danger" disabled={busyAction === 'logout'} onClick={forceLogoutAll}>
            <Icon name="logout" size={14} /> Force logout everyone
          </button>
        </div>
        <p className="mc-super-note">
          Every switch here is enforced server-side, not just displayed: maintenance mode blocks public storefront traffic, payments/withdrawals freezes block the actual money-moving endpoints, disabling partner APIs blocks the partner self-service portal, and disabling login blocks sign-in for everyone except super admins (so whoever flips it can always flip it back).
        </p>
      </div>

      {toast && <div className={`mc-toast ${toast.isError ? 'mc-toast-error' : ''}`}>{toast.message}</div>}
    </div>
  );
}
