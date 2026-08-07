import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

// Notifications that mean "your role was approved" get a direct navigation
// button to the relevant dashboard, so approval leads straight to action.
function actionFor(notification) {
  if (notification.type !== 'shop_approved') return null;
  const role = notification.metadata?.requestedRole;
  if (role === 'delivery') return { to: '/delivery', label: '🚴 Go to Delivery Dashboard' };
  return { to: '/seller', label: '🏪 Go to Seller Dashboard' };
}

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/notifications/mine');
      setNotifications(data.notifications || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await client.post(`/notifications/${id}/read`);
    load();
  };

  if (loading) return <div className="empty-state">Loading notifications…</div>;
  if (notifications.length === 0) return <div className="empty-state">No notifications yet.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {notifications.map((n) => {
        const action = actionFor(n);
        return (
          <div key={n.id} className="card-surface" style={{ padding: 16, opacity: n.is_read ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <strong>{n.title}</strong>
              {!n.is_read && <button className="btn-link" onClick={() => markRead(n.id)}>Mark read</button>}
            </div>
            <p style={{ color: '#5B6760', marginTop: 4, fontSize: '0.9rem' }}>{n.body}</p>
            <span style={{ fontSize: '0.75rem', color: '#8A9189' }}>{new Date(n.created_at).toLocaleString()}</span>
            {action && (
              <div style={{ marginTop: 10 }}>
                <Link to={action.to}>
                  <button className="btn-primary" style={{ width: 'auto', padding: '8px 18px' }}>{action.label}</button>
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
