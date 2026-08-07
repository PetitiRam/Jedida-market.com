import { useEffect, useState } from 'react';
import DropdownShell from './DropdownShell';
import RippleIconButton from './RippleIconButton';
import Icon from '../icons/icon';
import client from '../../api/client';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function NotificationsMenu() {
  const [notifications, setNotifications] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    client.get('/notifications/mine').then(({ data }) => {
      setNotifications(data.notifications || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  };

  useEffect(() => { load(); }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markOneRead = (id) => {
    client.post(`/notifications/${id}/read`).catch(() => {});
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = () => {
    notifications.filter((n) => !n.is_read).forEach((n) => client.post(`/notifications/${n.id}/read`).catch(() => {}));
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <DropdownShell
      onOpen={load}
      width={340}
      trigger={({ open, toggle }) => (
        <RippleIconButton
          label="Notifications"
          active={open}
          onClick={toggle}
          badge={unreadCount > 0 && <span className="jd-badge jd-badge-pulse">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        >
          <Icon name="bell" size={19} />
        </RippleIconButton>
      )}
    >
      {() => (
        <>
          <div className="jd-menu-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="jd-menu-header-action" onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          <div className="jd-menu-list">
            {!loaded && <div className="jd-menu-empty">Loading…</div>}
            {loaded && notifications.length === 0 && (
              <div className="jd-menu-empty">You're all caught up — no notifications yet.</div>
            )}
            {notifications.slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                className={`jd-menu-row ${!n.is_read ? 'is-unread' : ''}`}
                onClick={() => markOneRead(n.id)}
              >
                <span className="jd-menu-row-dot" />
                <span className="jd-menu-row-body">
                  <span className="jd-menu-row-title">{n.title}</span>
                  {n.body && <span className="jd-menu-row-sub">{n.body}</span>}
                  <span className="jd-menu-row-time">{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </DropdownShell>
  );
}
