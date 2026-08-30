import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import JdDashboardShell from '../../components/layout/JdDashboardShell';
import EmbeddedSupportChat from '../../components/chat/EmbeddedSupportChat';

import BuyerDashboardHome from './BuyerDashboardHome';
import MyOrders from './MyOrders';
import CartPage from './CartPage';
import NotificationsPage from './NotificationsPage';
import BuyerFollowingPanel from './BuyerFollowingPanel';
import MyQuoteRequests from './MyQuoteRequests';
import MyAgreements from './MyAgreements';
import LogisticsHub from './LogisticsHub';
import DocumentCenter from './DocumentCenter';
import UpgradePage from '../upgrade/UpgradePage';
import AffiliatePage from '../AffiliatePage';
import MyProfile from '../MyProfile';
import AccountSecurity from '../AccountSecurity';
import WalletKycPanel from '../../components/WalletKycPanel';

// Base tabs every buyer sees. Icons come from JdIcons.jsx / roleNav.js.
const BASE_TABS = [
  { key: 'home', label: 'Dashboard', icon: 'dashboard' },
  { key: 'orders', label: 'Orders', icon: 'orders' },
  { key: 'cart', label: 'Cart', icon: 'cart' },
  { key: 'chat', label: 'Messages', icon: 'messages' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'following', label: 'Following', icon: 'following' },
  { key: 'wanted', label: 'Jedida Wanted', icon: 'purchase' },
  { key: 'quoteRequests', label: 'Quote Requests', icon: 'quality' },
  { key: 'agreements', label: 'My Agreements', icon: 'wholesale' },
  { key: 'logistics', label: 'Logistics Hub', icon: 'shipments' },
  { key: 'documents', label: 'Documents', icon: 'inventory' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet' },
  { key: 'upgrades', label: 'Upgrades', icon: 'earnings' },
  { key: 'affiliate', label: 'Affiliate', icon: 'analytics' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

/**
 * Buyer Dashboard — the buyer's operational workspace, built on the same
 * JdDashboardShell/Sidebar/BottomNav pattern SellerDashboard.jsx and
 * DeliveryDashboard.jsx already use. Every panel below is either an
 * existing buyer page rendered with `embedded` (so it doesn't render a
 * second <MarketplaceHeader/> inside the shell) or an existing
 * shared/global panel (Wallet, Chat, Upgrade, Affiliate, Profile) reused
 * as-is — no second cart, order, chat, wallet, or profile system.
 *
 * Only shows features relevant to the buyer's current capabilities
 * (spec section 3): Affiliate only renders once we know the account is
 * enrolled/eligible, and Upgrades always shows since any buyer can apply.
 */
export default function BuyerDashboard() {
  const [user, setUser] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [affiliateEligible, setAffiliateEligible] = useState(false);
  const [tab, setTab] = useState('home');
  const navigate = useNavigate();

  // Jedida Wanted is its own full workspace now (own sidebar/layout,
  // see WantedSidebar.jsx) rather than embeddable tab content -- same
  // treatment as POS and Live Shopping elsewhere in this dashboard.
  const selectTab = (key) => {
    if (key === 'wanted') { navigate('/wanted'); return; }
    setTab(key);
  };

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setUser(data.user)).catch(() => {});
    client.get('/notifications/mine').then(({ data }) => {
      setUnreadNotifications((data.notifications || []).filter((n) => !n.is_read).length);
    }).catch(() => {});
    // Only show the Affiliate tab once we know the account can actually
    // use it, rather than always showing a tab that 403s (spec section 3:
    // "show only features relevant to the user's current capabilities").
    client.get('/affiliate/me').then(() => setAffiliateEligible(true)).catch(() => setAffiliateEligible(false));
  }, []);

  const tabs = BASE_TABS.filter((t) => t.key !== 'affiliate' || affiliateEligible);

  return (
    <JdDashboardShell
      role="buyer"
      items={tabs}
      activeTab={tab}
      onSelect={selectTab}
      title="Buyer Dashboard"
      subtitle="Your orders, cart, messages and marketplace activity."
      userName={user?.name}
      userRoleLabel="Buyer"
      avatarUrl={user?.avatar_url}
      notificationCount={unreadNotifications}
      messageCount={unreadMessages}
      primaryAction={{ label: 'Browse Marketplace', icon: 'products', onClick: () => window.location.assign('/marketplace') }}
    >
      {tab === 'home' && <BuyerDashboardHome user={user} onNavigate={selectTab} />}
      {tab === 'orders' && <MyOrders embedded />}
      {tab === 'cart' && <CartPage embedded />}
      {tab === 'chat' && <EmbeddedSupportChat />}
      {tab === 'notifications' && <NotificationsPage embedded />}
      {tab === 'following' && <BuyerFollowingPanel />}
      {tab === 'quoteRequests' && <MyQuoteRequests embedded />}
      {tab === 'agreements' && <MyAgreements embedded />}
      {tab === 'logistics' && <LogisticsHub embedded />}
      {tab === 'documents' && <DocumentCenter embedded />}
      {tab === 'wallet' && <WalletKycPanel />}
      {tab === 'upgrades' && <UpgradePage />}
      {tab === 'affiliate' && affiliateEligible && <AffiliatePage />}
      {tab === 'profile' && <MyProfile embedded />}
      {tab === 'settings' && <AccountSecurity />}
    </JdDashboardShell>
  );
}
