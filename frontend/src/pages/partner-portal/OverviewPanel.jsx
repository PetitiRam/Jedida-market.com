function StatCard({ label, value, sub }) {
  return (
    <div className="jd-portal-stat-card">
      <div className="jd-portal-stat-label">{label}</div>
      <div className="jd-portal-stat-value">{value}</div>
      {sub && <div className="jd-portal-stat-sub">{sub}</div>}
    </div>
  );
}

export default function OverviewPanel({ dashboard, onRefresh }) {
  if (!dashboard) return <div className="jd-portal-card"><div className="empty-state">Loading dashboard…</div></div>;

  const { partnership, integrationStatus, activeServices, apiStatus, recentNotifications, supportTickets, activityTimeline } = dashboard;

  return (
    <div>
      {partnership.status === 'suspended' && (
        <div className="jd-portal-card">
          <div className="jd-portal-locked">
            <div className="jd-portal-locked-icon">⚠️</div>
            <strong>Your partnership is currently suspended.</strong>
            <p>{partnership.suspendedReason || 'Contact partnerships@jedidamarketplace.com for details.'}</p>
          </div>
        </div>
      )}

      <div className="jd-portal-stat-grid">
        <StatCard label="API Status" value={apiStatus === 'connected' ? 'Connected' : apiStatus === 'locked' ? 'Locked' : 'Not Configured'} sub={`${integrationStatus.activeKeyCount} active key(s)`} />
        <StatCard label="Webhooks" value={integrationStatus.activeWebhookCount} sub="active endpoints" />
        <StatCard label="Open Tickets" value={supportTickets.open} sub="awaiting response" />
        <StatCard label="Active Services" value={activeServices.length} sub={activeServices.join(', ') || 'None yet'} />
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-head">
          <div>
            <div className="jd-portal-card-title">Recent Notifications</div>
            <div className="jd-portal-card-sub">Updates about your partnership, API, and support</div>
          </div>
          <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} onClick={onRefresh}>Refresh</button>
        </div>
        {recentNotifications.length === 0 && <div className="empty-state">No notifications yet.</div>}
        {recentNotifications.map((n) => (
          <div key={n.id} className="jd-portal-log-row">
            <strong>{n.title}</strong>
            <div className="jd-portal-log-meta">{n.body}</div>
            <div className="jd-portal-log-meta">{new Date(n.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Activity Timeline</div>
        {activityTimeline.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
        {activityTimeline.map((entry, i) => (
          <div key={i} className="jd-portal-log-row">
            <strong>{entry.action.replace(/_/g, ' ')}</strong>
            <div className="jd-portal-log-meta">{new Date(entry.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
