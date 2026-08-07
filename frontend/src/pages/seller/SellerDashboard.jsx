import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import client from '../../api/client';
import Logo from '../../components/Logo';
import TabBar from '../../components/TabBar';
import ChatPanel from '../../components/ChatPanel';
import ShopSetupPanel from './ShopSetupPanel';
import MyProductsPanel from './MyProductsPanel';
import AddProductPanel from './AddProductPanel';
import TemplatesPanel from './TemplatesPanel';
import NotificationsPanel from './NotificationsPanel';
import OrdersPanel from './OrdersPanel';
import InvoicesPanel from './InvoicesPanel';
import WalletPanel from './WalletPanel';
import ShopSettingsPanel from './ShopSettingsPanel';
import ShopBuilderDashboard from './ShopBuilderDashboard';
import SourcingCatalogPanel from './SourcingCatalogPanel';
import MyImportsPanel from './MyImportsPanel';
import AIAssistantHubPanel from './AIAssistantHubPanel';
import BusinessProfilePanel from './BusinessProfilePanel';
import WholesaleCatalogPanel from './WholesaleCatalogPanel';
import QuoteRequestsPanel from './QuoteRequestsPanel';
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
  { key: 'wallet', label: 'Wallet' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'verification', label: '✅ Verification' },
  { key: 'shopFeed', label: '📣 Shop Feed' },
  { key: 'growthHub', label: '🚀 Growth' },
  { key: 'chat', label: 'Chat with Admin' },
  { key: 'shopSettings', label: 'Shop Settings' }
];

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

// Business roles built on the same shop/product/order/wallet foundation as
// seller (see schema_phase37) — they share this dashboard shell until their
// own role-specific modules (sourcing, inventory sync, etc.) ship.
const SHARED_DASHBOARD_ROLES = ['seller', 'manufacturer', 'supplier', 'dropshipper', 'farmer'];
const ROLE_LABELS = { seller: 'Seller', manufacturer: 'Manufacturer', supplier: 'Supplier', dropshipper: 'Dropshipper', farmer: 'Farmer' };

export default function SellerDashboard() {
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setUser(data.user)).finally(() => setChecked(true));
    client.get('/notifications/mine').then(({ data }) => {
      setUnread((data.notifications || []).filter((n) => !n.is_read).length);
    });
  }, []);

  if (checked && user && !SHARED_DASHBOARD_ROLES.includes(user.primary_role)) {
    return <Navigate to="/seller/upgrade" replace />;
  }

  const roleLabel = ROLE_LABELS[user?.primary_role] || 'Seller';

  return (
    <div>
      <header className="dash-header">
        <Logo size={32} />
        <div className="dash-header-right">
          <Link to="/marketplace" className="btn-link">Main Marketplace →</Link>
          <span className="icon-btn">
            🔔{unread > 0 && <span className="badge-dot" />}
          </span>
        </div>
      </header>

      <div className="dash-body">
        <h2 style={{ marginBottom: 4 }}>{roleLabel} Dashboard</h2>
        <p style={{ color: '#5B6760', marginBottom: 8 }}>Manage your shop, listings and orders.</p>

        <TabBar tabs={tabsForRole(user?.primary_role)} initial="shop">
          {(active) => (
            <>
              {active === 'shop' && <ShopSetupPanel />}
              {active === 'shopBuilder' && <ShopBuilderDashboard />}
              {active === 'products' && <MyProductsPanel />}
              {active === 'add' && <AddProductPanel />}
              {active === 'templates' && <TemplatesPanel />}
              {active === 'aiAssistant' && <AIAssistantHubPanel />}
              {active === 'sourcing' && <SourcingCatalogPanel />}
              {active === 'myImports' && <MyImportsPanel />}
              {active === 'businessProfile' && <BusinessProfilePanel role={user?.primary_role} />}
              {active === 'wholesaleCatalog' && <WholesaleCatalogPanel />}
              {active === 'quoteRequests' && <QuoteRequestsPanel />}
              {active === 'businessAnalytics' && <BusinessAnalyticsPanel />}
              {active === 'agriculture' && <AgriculturePanel />}
              {active === 'dropshipNetwork' && <DropshipManagementPanel />}
              {active === 'collections' && <CollectionsPanel />}
              {active === 'purchaseAgreements' && <PurchaseAgreementsPanel />}
              {active === 'bulkInvoices' && <BulkInvoicesPanel />}
              {active === 'dropshipPartners' && <DropshipPartnersPanel />}
              {active === 'dropshipProducts' && <MyDropshipProductsPanel />}
              {active === 'dropshipSales' && <DropshipSalesPanel />}
              {active === 'orders' && <OrdersPanel />}
              {active === 'invoices' && <InvoicesPanel />}
              {active === 'wallet' && <WalletPanel />}
              {active === 'notifications' && <NotificationsPanel />}
              {active === 'verification' && <SellerVerificationStatus />}
              {active === 'shopFeed' && <SellerFeedComposer />}
              {active === 'growthHub' && <GrowthHubPanel />}
              {active === 'chat' && <ChatPanel />}
              {active === 'shopSettings' && <ShopSettingsPanel />}
            </>
          )}
        </TabBar>
      </div>
    </div>
  );
}
