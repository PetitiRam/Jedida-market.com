import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import { subscribeToProfilePhotoUpdates } from '../../utils/profileSync';
import JdDashboardShell from '../../components/layout/JdDashboardShell';
// change this import:
import EmbeddedSupportChat from '../../components/chat/EmbeddedSupportChat';
import ShopSetupPanel from './ShopSetupPanel';
import MyProductsPanel from './MyProductsPanel';
import AddProductPanel from './AddProductPanel';
import TemplatesPanel from './TemplatesPanel';
import NotificationsPanel from './NotificationsPanel';
import OrdersPanel from './OrdersPanel';
import InvoicesPanel from './InvoicesPanel';
import WalletPanel from './WalletPanel';
import LiveDashboardPanel from './LiveDashboardPanel';
import SellerPaymentsPanel from './SellerPaymentsPanel';
import SellerShippingPanel from './SellerShippingPanel';
import SellerFeaturesPanel from './SellerFeaturesPanel';
import ShopSettingsPanel from './ShopSettingsPanel';
import ShopBuilderDashboard from './ShopBuilderDashboard';
import SourcingCatalogPanel from './SourcingCatalogPanel';
import MyImportsPanel from './MyImportsPanel';
import AIAssistantHubPanel from './AIAssistantHubPanel';
import BusinessProfilePanel from './BusinessProfilePanel';
import WholesaleCatalogPanel from './WholesaleCatalogPanel';
import QuoteRequestsPanel from './QuoteRequestsPanel';
import WantedInboxPanel from './WantedInboxPanel';
import TradeCapabilitiesPanel from './TradeCapabilitiesPanel';
import BusinessAnalyticsPanel from './BusinessAnalyticsPanel';
import AgriculturePanel from '../agriculture/AgriculturePanel';
import DropshipPartnersPanel from './DropshipPartnersPanel';
import MyDropshipProductsPanel from './MyDropshipProductsPanel';
import DropshipSalesPanel from './DropshipSalesPanel';
import DropshipManagementPanel from './DropshipManagementPanel';
import CollectionsPanel from './CollectionsPanel';
import PurchaseAgreementsPanel from './PurchaseAgreementsPanel';
import BulkInvoicesPanel from './BulkInvoicesPanel';
import SellerVerificationStatus from './SellerVerificationStatus';
import SellerFeedComposer from './SellerFeedComposer';
import GrowthHubPanel from './GrowthHubPanel';

const BASE_TABS = [
  { key: 'shop', label: 'My Shop' },
  { key: 'shopBuilder', label: 'Shop Builder' },
  { key: 'products', label: 'My Products' },
  { key: 'add', label: 'Add Product' },
  { key: 'templates', label: 'Templates' },
  { key: 'aiAssistant', label: 'AI Assistant' },
  { key: 'orders', label: 'Orders' },
  { key: 'invoices', label: 'Invoices & Receipts' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'payments', label: 'Payments' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'live', label: 'Live Shopping' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'verification', label: 'Verification' },
  { key: 'shopFeed', label: 'Shop Feed' },
  { key: 'growthHub', label: 'Growth' },
  { key: 'features', label: 'Features' },
  { key: 'chat', label: 'Chat with Admin' },
  { key: 'shopSettings', label: 'Shop Settings' }
];

// Icon per tab key — every key in BASE_TABS and every key tabsForRole() can
// ever insert must have an entry (or it falls back to 'dashboard' below).
const TAB_ICONS = {
  shop: 'dashboard',
  shopBuilder: 'wholesale',
  products: 'products',
  add: 'plus',
  templates: 'inventory',
  aiAssistant: 'analytics',
  sourcing: 'imports',
  myImports: 'imports',
  businessProfile: 'profile',
  wholesaleCatalog: 'wholesale',
  quoteRequests: 'purchase',
  wantedInbox: 'messages',
  tradeCapabilities: 'shipments',
  businessAnalytics: 'analytics',
  agriculture: 'production',
  dropshipNetwork: 'customers',
  collections: 'inventory',
  purchaseAgreements: 'purchase',
  bulkInvoices: 'orders',
  dropshipPartners: 'customers',
  dropshipProducts: 'imports',
  dropshipSales: 'earnings',
  orders: 'orders',
  invoices: 'orders',
  wallet: 'wallet',
  shipping: 'shipments',
  payments: 'wallet',
  features: 'settings',
  notifications: 'bell',
  verification: 'quality',
  shopFeed: 'marketing',
  growthHub: 'marketing',
  chat: 'messages',
  shopSettings: 'settings',
};

// Only seller/supplier accounts source products from someone else's catalog
// and turn it into a listing they own (see SOURCING_ROLES in
// sourcingController.js) — a manufacturer is upstream of that chain, and a
// dropshipper resells under the original listing without ever owning it
// (see dropshipController.js / schema_phase42), so neither gets these tabs.
const SOURCING_ELIGIBLE_ROLES = ['seller', 'supplier'];

// Manufacturer/supplier/farmer run a bulk-only wholesale storefront on top
// of the shared shop/product foundation (see schema_phase37/41/45) —
// dropshipper resells someone else's catalog instead, so it doesn't get
// these tabs.
const B2B_ROLES = ['manufacturer', 'supplier', 'farmer'];
const B2B_PROFILE_TAB_LABEL = { manufacturer: 'Factory Profile', supplier: 'Warehouse Profile', farmer: 'Farm Profile' };

// Roles eligible for the Agriculture tab (seasonal availability, harvest
// calendar, farm-level certifications, supply contracts — schema_phase45).
const AGRI_ELIGIBLE_ROLES = ['farmer', 'supplier', 'manufacturer'];

// A dropshipper never uploads or owns a listing, so it gets its own tab set
// (partners/catalog/sales) instead of My Products / Add Product / Templates.
const DROPSHIPPER_ROLE = 'dropshipper';

function tabsForRole(role) {
  let tabs = BASE_TABS;
  if (role === DROPSHIPPER_ROLE) {
    tabs = tabs.filter((t) => !['products', 'add', 'templates'].includes(t.key));
    const insertAt = tabs.findIndex((t) => t.key === 'orders');
    tabs = [
      ...tabs.slice(0, insertAt),
      { key: 'dropshipPartners', label: 'Dropship Partners' },
      { key: 'dropshipProducts', label: 'Dropship Products' },
      { key: 'dropshipSales', label: 'Dropship Sales' },
      ...tabs.slice(insertAt)
    ];
    return tabs;
  }
  if (SOURCING_ELIGIBLE_ROLES.includes(role)) {
    const insertAt = tabs.findIndex((t) => t.key === 'orders');
    tabs = [
      ...tabs.slice(0, insertAt),
      { key: 'sourcing', label: 'Sourcing' },
      { key: 'myImports', label: 'My Imports' },
      ...tabs.slice(insertAt)
    ];
  }
  if (B2B_ROLES.includes(role)) {
    const insertAt = tabs.findIndex((t) => t.key === 'orders');
    tabs = [
      ...tabs.slice(0, insertAt),
      { key: 'businessProfile', label: B2B_PROFILE_TAB_LABEL[role] || 'Business Profile' },
      { key: 'wholesaleCatalog', label: 'Wholesale Catalog' },
      { key: 'quoteRequests', label: 'Quote Requests' },
      { key: 'wantedInbox', label: 'Jedida Wanted' },
      ...(['manufacturer', 'supplier'].includes(role) ? [{ key: 'tradeCapabilities', label: 'China Trade Hub' }] : []),
      { key: 'businessAnalytics', label: 'Analytics' },
      { key: 'collections', label: 'Collections' },
      { key: 'purchaseAgreements', label: 'Purchase Agreements' },
      { key: 'bulkInvoices', label: 'Bulk Invoices' },
      { key: 'dropshipNetwork', label: 'Dropship Network' },
      ...tabs.slice(insertAt)
    ];
  }
  if (AGRI_ELIGIBLE_ROLES.includes(role)) {
    const insertAt = tabs.findIndex((t) => t.key === 'orders');
    tabs = [...tabs.slice(0, insertAt), { key: 'agriculture', label: 'Agriculture' }, ...tabs.slice(insertAt)];
  }
  return tabs;
}

// tabsForRole() gives {key,label} — the sidebar/bottom-nav also want an
// icon per item, so this maps over the same list and looks up TAB_ICONS.
function navItemsForRole(role) {
  return tabsForRole(role).map((t) => ({ ...t, icon: TAB_ICONS[t.key] || 'dashboard' }));
}

// Business roles built on the same shop/product/order/wallet foundation as
// seller (see schema_phase37) — they share this dashboard shell until their
// own role-specific modules (sourcing, inventory sync, etc.) ship.
const SHARED_DASHBOARD_ROLES = ['seller', 'manufacturer', 'supplier', 'dropshipper', 'farmer'];
const ROLE_LABELS = { seller: 'Seller', manufacturer: 'Manufacturer', supplier: 'Supplier', dropshipper: 'Dropshipper', farmer: 'Farmer' };

export default function SellerDashboard() {
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState('shop');

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setUser(data.user)).finally(() => setChecked(true));
    client.get('/notifications/mine').then(({ data }) => {
      setUnread((data.notifications || []).filter((n) => !n.is_read).length);
    });
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    return subscribeToProfilePhotoUpdates(user.id, (patch) => {
      setUser((prev) => prev && ({ ...prev, ...patch }));
    });
  }, [user?.id]);

  if (checked && user && !SHARED_DASHBOARD_ROLES.includes(user.primary_role)) {
    return <Navigate to="/seller/upgrade" replace />;
  }

  const role = user?.primary_role || 'seller';
  const roleLabel = ROLE_LABELS[role] || 'Seller';

  return (
    <JdDashboardShell
      role={role}
      items={navItemsForRole(role)}
      activeTab={tab}
      onSelect={setTab}
      shopName={user?.shop_name}
      title={`${roleLabel} Dashboard`}
      subtitle="Manage your shop, listings and orders."
      userName={user?.name}
      userRoleLabel={roleLabel}
      avatarUrl={user?.avatar_url}
      notificationCount={unread}
      primaryAction={role !== 'delivery' ? { label: 'Add Product', icon: 'plus', onClick: () => setTab('add') } : undefined}
    >
      {tab === 'shop' && <ShopSetupPanel />}
      {tab === 'shopBuilder' && <ShopBuilderDashboard />}
      {tab === 'products' && <MyProductsPanel />}
      {tab === 'add' && <AddProductPanel />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'aiAssistant' && <AIAssistantHubPanel />}
      {tab === 'sourcing' && <SourcingCatalogPanel />}
      {tab === 'myImports' && <MyImportsPanel />}
      {tab === 'businessProfile' && <BusinessProfilePanel role={role} />}
      {tab === 'wholesaleCatalog' && <WholesaleCatalogPanel />}
      {tab === 'quoteRequests' && <QuoteRequestsPanel />}
      {tab === 'wantedInbox' && <WantedInboxPanel />}
      {tab === 'tradeCapabilities' && <TradeCapabilitiesPanel />}
      {tab === 'businessAnalytics' && <BusinessAnalyticsPanel />}
      {tab === 'agriculture' && <AgriculturePanel />}
      {tab === 'dropshipNetwork' && <DropshipManagementPanel />}
      {tab === 'collections' && <CollectionsPanel />}
      {tab === 'purchaseAgreements' && <PurchaseAgreementsPanel />}
      {tab === 'bulkInvoices' && <BulkInvoicesPanel />}
      {tab === 'dropshipPartners' && <DropshipPartnersPanel />}
      {tab === 'dropshipProducts' && <MyDropshipProductsPanel />}
      {tab === 'dropshipSales' && <DropshipSalesPanel />}
      {tab === 'orders' && <OrdersPanel />}
      {tab === 'invoices' && <InvoicesPanel />}
      {tab === 'shipping' && <SellerShippingPanel />}
      {tab === 'payments' && <SellerPaymentsPanel />}
      {tab === 'wallet' && <WalletPanel />}
      {tab === 'live' && <LiveDashboardPanel />}
      {tab === 'notifications' && <NotificationsPanel />}
      {tab === 'verification' && <SellerVerificationStatus />}
      {tab === 'shopFeed' && <SellerFeedComposer />}
      {tab === 'growthHub' && <GrowthHubPanel />}
      {tab === 'features' && <SellerFeaturesPanel />}
      {tab === 'chat' && <EmbeddedSupportChat />}
      {tab === 'shopSettings' && <ShopSettingsPanel />}
    </JdDashboardShell>
  );
}
