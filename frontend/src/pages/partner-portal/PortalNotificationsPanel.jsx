import { useEffect, useState } from 'react';
import { getMyNotifications, markNotificationRead } from '../../api/partnerPortalApi';

export default function PortalNotificationsPanel() {
  const [notifications, setNotifications] = useState([]);

  const load = () => getMyNotifications().then(({ data }) => setNotifications(data.notifications || data));
  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await markNotificationRead(id);
    load();
  };

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-head">
        <div>
          <div className="jd-portal-card-title">Notifications</div>
          <div className="jd-portal-card-sub">Partnership updates, API changes, support responses, security alerts, and maintenance notices</div>
        </div>
        <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} onClick={load}>Refresh</button>
      </div>
      {notifications.length === 0 && <div className="empty-state">No notifications yet.</div>}
      {notifications.map((n) => (
        <div key={n.id} className="jd-portal-log-row" style={{ opacity: n.is_read ? 0.65 : 1 }}>
          <strong>{n.title}</strong>
          <div className="jd-portal-log-meta">{n.body}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span className="jd-portal-log-meta">{new Date(n.created_at).toLocaleString()}</span>
            {!n.is_read && (
              <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => markRead(n.id)}>Mark read</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
