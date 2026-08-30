import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import * as commerceApi from '../../api/commerceApi';
import * as wantedApi from '../../api/wantedApi';

const ACTIVE_ORDER_STATUSES = ['pending_payment', 'paid_escrow', 'shipped'];
const ACTION_ORDER_STATUSES = ['pending_payment', 'delivered_confirmed'];
const IN_TRANSIT_STATUSES = ['shipped', 'out_for_delivery', 'in_transit'];
const ACTIVE_WANTED_STATUSES = ['submitted', 'matching', 'matched', 'quoted'];

function SummaryCard({ label, value, onClick, tone }) {
  const content = (
    <div className="card-surface" style={{ minWidth: 150, flex: '1 1 150px' }}>
      <div className="product-card-meta">{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: tone }}>{value}</div>
    </div>
  );
  if (!onClick) return content;
  return (
    <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', flex: '1 1 150px' }}>
      {content}
    </button>
  );
}

function QuickAction({ label, to, onClick }) {
  const inner = <span className="btn-secondary" style={{ display: 'inline-block' }}>{label}</span>;
  return to
    ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link>
    : <button type="button" className="btn-secondary" onClick={onClick}>{label}</button>;
}

/**
 * Dashboard Home — surfaces only actionable/useful info (spec section 3):
 * active orders, orders requiring action, orders in transit, unread
 * messages, notifications, saved products, followed shops, active Wanted
 * requests. No decorative analytics — every number here links somewhere.
 */
export default function BuyerDashboardHome({ user, onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [followedShops, setFollowedShops] = useState([]);
  const [wanted, setWanted] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      client.get('/orders/mine/buyer'),
      client.get('/notifications/mine'),
      commerceApi.listMyWishlist(),
      commerceApi.listMyFollowedShops(),
      wantedApi.myWantedRequests(),
      client.get('/wallets/mine'),
    ]).then(([ordersRes, notifRes, wishlistRes, followedRes, wantedRes, walletRes]) => {
      if (cancelled) return;
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value.data.orders || []);
      if (notifRes.status === 'fulfilled') setNotifications(notifRes.value.data.notifications || []);
      if (wishlistRes.status === 'fulfilled') setWishlist(wishlistRes.value.data.products || wishlistRes.value.data.items || []);
      if (followedRes.status === 'fulfilled') setFollowedShops(followedRes.value.data.shops || []);
      if (wantedRes.status === 'fulfilled') setWanted(wantedRes.value.data.requests || []);
      if (walletRes.status === 'fulfilled') setWallet(walletRes.value.data.wallet || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="empty-state">Loading your dashboard…</div>;

  const activeOrders = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status));
  const needsAction = orders.filter((o) => ACTION_ORDER_STATUSES.includes(o.status) || o.status === 'disputed');
  const inTransit = orders.filter((o) => IN_TRANSIT_STATUSES.includes(o.status));
  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const activeWanted = wanted.filter((w) => ACTIVE_WANTED_STATUSES.includes(w.status));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Active Orders" value={activeOrders.length} onClick={() => onNavigate?.('orders')} />
        <SummaryCard label="Needs Your Action" value={needsAction.length} tone={needsAction.length ? 'var(--terracotta)' : undefined} onClick={() => onNavigate?.('orders')} />
        <SummaryCard label="In Transit" value={inTransit.length} onClick={() => onNavigate?.('orders')} />
        <SummaryCard label="Unread Notifications" value={unreadNotifications.length} tone={unreadNotifications.length ? 'var(--terracotta)' : undefined} onClick={() => onNavigate?.('notifications')} />
        <SummaryCard label="Saved Products" value={wishlist.length} onClick={() => onNavigate?.('following')} />
        <SummaryCard label="Shops Followed" value={followedShops.length} onClick={() => onNavigate?.('following')} />
        <SummaryCard label="Active Wanted Requests" value={activeWanted.length} onClick={() => onNavigate?.('wanted')} />
        {wallet && <SummaryCard label={`Wallet Balance (${wallet.currency || ''})`} value={Number(wallet.availableBalance ?? wallet.balance ?? 0).toLocaleString()} onClick={() => onNavigate?.('wallet')} />}
      </div>

      <h3 style={{ marginBottom: 12 }}>Quick actions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
        <button type="button" className="btn-primary" onClick={() => onNavigate?.('cart')}>Go to Cart</button>
        <QuickAction label="Post a Wanted Request" onClick={() => onNavigate?.('wanted')} />
        <QuickAction label="Track an Order" onClick={() => onNavigate?.('orders')} />
        <QuickAction label="Message Support" onClick={() => onNavigate?.('chat')} />
        <QuickAction label="Browse Marketplace" to="/marketplace" />
      </div>

      {needsAction.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12 }}>Orders requiring action</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {needsAction.slice(0, 5).map((o) => (
              <div className="card-surface" key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong>Order {o.id.slice(0, 8)}</strong>
                  <div className="product-card-meta">{o.currency} {Number(o.total_amount).toLocaleString()}</div>
                </div>
                <span className={`status-chip status-${o.status}`}>{o.status.replace(/_/g, ' ')}</span>
                <button type="button" className="btn-link" onClick={() => onNavigate?.('orders')}>Review order</button>
              </div>
            ))}
          </div>
        </>
      )}

      {unreadNotifications.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12 }}>Recent notifications</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {unreadNotifications.slice(0, 5).map((n) => (
              <div className="card-surface" key={n.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>{n.title || n.message}</span>
                <button type="button" className="btn-link" onClick={() => onNavigate?.('notifications')}>View</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
