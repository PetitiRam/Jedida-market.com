import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import MarketplaceHeader from '../../components/MarketplaceHeader';

const PAGE_SIZE = 30;

// Notifications whose type implies a place to go — same idea as the seller
// panel's approval-notification action button, generalized to the handful
// of types that already carry a natural destination.
function actionFor(n) {
  if (n.metadata?.orderId) return { to: `/orders/${n.metadata.orderId}`, label: 'View order' };
  if (n.type === 'shop_approved') return { to: '/seller', label: 'Go to Seller Dashboard' };
  if (n.type === 'dispute_update' && n.metadata?.disputeId) return { to: '/orders', label: 'View orders' };
  return null;
}

function formatWhen(iso) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'

  const load = async (targetPage = 1, append = false) => {
    setLoading(true);
    try {
      const { data } = await client.get('/notifications/mine', {
        params: { page: targetPage, pageSize: PAGE_SIZE }
      });
      const batch = data.notifications || [];
      setNotifications((prev) => (append ? [...prev, ...batch] : batch));
      setHasMore(batch.length === PAGE_SIZE);
      setPage(targetPage);
    } catch {
      // leave existing list as-is on a failed refresh
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, false); }, []);

  const markOneRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await client.post(`/notifications/${id}/read`);
    } catch {
      // no rollback — a stray unread flag on refresh isn't worth re-erroring the page
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await Promise.all(unread.map((n) => client.post(`/notifications/${n.id}/read`).catch(() => {})));
  };

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="jp-page">
      <MarketplaceHeader />

      <div className="jp-container" style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Notifications</h1>
          {unreadCount > 0 && (
            <button type="button" className="btn-link" onClick={markAllRead}>
              Mark all read
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={filter === 'all' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 16px', width: 'auto' }}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={filter === 'unread' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 16px', width: 'auto' }}
            onClick={() => setFilter('unread')}
          >
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>
        </div>

        {loading && notifications.length === 0 && (
          <div className="empty-state">Loading notifications…</div>
        )}

        {!loading && visible.length === 0 && (
          <div className="empty-state">
            {filter === 'unread' ? "You're all caught up — no unread notifications." : 'No notifications yet.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((n) => {
            const action = actionFor(n);
            return (
              <div
                key={n.id}
                className="card-surface"
                style={{
                  padding: 16,
                  borderLeft: n.is_read ? '3px solid transparent' : '3px solid var(--jd-accent, #1a5c3a)',
                  background: n.is_read ? 'var(--card-bg, #fff)' : 'var(--cream-dim, #f6f8f5)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <strong style={{ fontSize: '1rem' }}>{n.title}</strong>
                  {!n.is_read && (
                    <button
                      type="button"
                      className="btn-link"
                      style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}
                      onClick={() => markOneRead(n.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>

                {/* Full body text, no truncation — the whole point of this
                    page versus the header dropdown, which clips long
                    messages to fit a small panel. */}
                {n.body && (
                  <p style={{ color: '#5B6760', marginTop: 8, fontSize: '0.95rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {n.body}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <span style={{ fontSize: '0.8rem', color: '#8A9189' }}>{formatWhen(n.created_at)}</span>
                  {action && (
                    <Link to={action.to} style={{ fontSize: '0.85rem' }} onClick={() => !n.is_read && markOneRead(n.id)}>
                      {action.label} →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {hasMore && filter === 'all' && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '8px 24px' }} disabled={loading} onClick={() => load(page + 1, true)}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
