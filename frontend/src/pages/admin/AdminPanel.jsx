import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import AdminSidebarShell from './AdminSidebarShell';
import AdminUpgradePanel from './AdminUpgradePanel';
import AdminShopsPanel from "./AdminShopsPanel";
import AdminProductsPanel from './AdminProductsPanel';
import AdminUsersPanel from './AdminUsersPanel';
import AdminOrdersPanel from './AdminOrdersPanel';
import AdminWithdrawalsPanel from './AdminWithdrawalsPanel';
import AdminAdsPanel from './AdminAdsPanel';
import AdminSettingsPanel from './AdminSettingsPanel';
import JedidaCommandCenter from './JedidaCommandCenter';
import AICommandCenter from './AICommandCenter';
import AdminSettingsCenter from './settings/AdminSettingsCenter';
import AdminChatBridgePanel from './AdminChatBridgePanel';
import AdminQuestionsPanel from './AdminQuestionsPanel';
import AdminQuotesPanel from './AdminQuotesPanel';
import AdminPayments from './AdminPayments';
import AdminDeliveryPanel from './AdminDeliveryPanel';
import AdminRolesPanel from './AdminRolesPanel';
import AdminPartnersPanel from './AdminPartnersPanel';
import AdminAffiliatePanel from './AdminAffiliatePanel';
import AdminAiTrainingCenter from './AdminAiTrainingCenter';
import AdminDashboard from './AdminDashboard';
import AdminDisputesPanel from './AdminDisputesPanel';
import AdminFraudPanel from './AdminFraudPanel';
import AdminVerificationLevelsPanel from './AdminVerificationLevelsPanel';
import AdminApiCentrePanel from './AdminApiCentrePanel';
import AdminKycReviewPanel from './AdminKycReviewPanel';
import AdminVerifiedShopsPanel from './AdminVerifiedShopsPanel';
import AdminMarketplaceBuilder from './AdminMarketplaceBuilder';
import SecurityOperationsDashboard from './SecurityOperationsDashboard';
const TABS = [
  { key: 'dashboard', label: '📊 Dashboard', area: 'dashboard' },
  { key: 'upgrades', label: '🆙 Upgrades', area: 'upgrades' },
  { key: 'shops', label: 'Shops', area: 'shops' },
  { key: 'products', label: 'Products', area: 'products' },
  { key: 'users', label: 'Users', area: 'users' },
  { key: 'orders', label: 'Orders & Payouts', area: 'orders' },
  { key: 'delivery', label: 'Delivery', area: 'delivery' },
  { key: 'withdrawals', label: 'Withdrawals', area: 'withdrawals' },
  { key: 'ads', label: 'Ads', area: 'ads' },
  { key: 'marketplaceBuilder', label: '🧩 Marketplace Builder', area: 'marketplace' },
  { key: 'securityOps', label: '🛡 Security Ops', area: 'security' },
  { key: 'settings', label: 'Settings', area: null }, // super admin only
  { key: 'roles', label: 'Roles & Permissions', area: null }, // super admin only
  { key: 'chat', label: '🛰️ Command Center', area: 'chat' },
  { key: 'ai', label: '🤖 AI Command Center', area: 'ai' },
  { key: 'aiTraining', label: '🎓 AI Training Center', area: 'ai' },
  { key: 'settingsCenter', label: '⚙️ Settings Center', area: null }, // super admin only
  { key: 'chatBridge', label: '🔗 Chat Bridging', area: 'chat' },
  { key: 'questions', label: '❓ Product Questions', area: 'products' },
  { key: 'quotes', label: 'Quote Requests', area: 'products' },
  { key: 'payments', label: '💳 Payments', area: 'withdrawals' },
  { key: 'partners', label: '🤝 Partner Management', area: 'partners' },
  { key: 'affiliates', label: '🔗 Affiliate Program', area: 'affiliates' },
  { key: 'disputes', label: '⚖️ Disputes', area: 'disputes' },
  { key: 'fraud', label: '🚨 Fraud Signals', area: 'fraud' },
  { key: 'verification', label: '✅ Verification Levels', area: 'upgrades' },
  { key: 'verifiedShops', label: '🛡️ Verified Shops', area: 'shops' },
  { key: 'kycReview', label: '🪪 KYC Verification Center', area: 'upgrades' },
  { key: 'apiCentre', label: '🔌 API Centre', area: null } // super admin only
];

// Mirrors the backend's ADMIN_ROLE_PERMISSIONS in middleware/auth.js — kept
// in one place here so adding a role only means updating two files, not
// hunting through every tab.
const ROLE_AREAS = {
  super_admin: ['*'],
  staff: ['orders', 'delivery', 'products'],
  moderator: ['products', 'shops', 'users'],
  support: ['chat', 'users'],
  finance: ['wallets', 'withdrawals', 'payments', 'orders', 'affiliates', 'disputes'],
  marketing: ['ads', 'campaigns', 'marketplace'],
  approvals: ['products', 'shops', 'upgrades', 'withdrawals', 'partners', 'affiliates'],
  ai_manager: ['ai'],
  chat_assistant: ['chat'],
  business_rep: ['chat', 'partners', 'shops'],
  security_agent: ['chat', 'users', 'products', 'disputes', 'fraud', 'security'],
};

function visibleTabs(adminRole) {
  if (!adminRole || adminRole === 'super_admin') return TABS; // legacy/full admin sees everything
  const allowed = ROLE_AREAS[adminRole] || [];
  return TABS.filter((t) => t.area === 'dashboard' ? true : t.area === null ? false : allowed.includes(t.area));
}
                                                                                                                                                                                                                                                                             
export default function AdminPanel() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setUser(data.user)).finally(() => setChecked(true));
  }, []);

  if (checked && user && !user.is_admin) return <Navigate to="/marketplace" replace />;

  const tabs = visibleTabs(user?.admin_role);

  return (
    <AdminSidebarShell tabs={tabs} initial="dashboard" user={user}>
      {(active) => (
        <>
          {active === 'dashboard' && <AdminDashboard adminRole={user?.admin_role} adminName={user?.full_name} />}
          {active === 'upgrades' && <AdminUpgradePanel />}
          {active === 'shops' && <AdminShopsPanel />}
          {active === 'products' && <AdminProductsPanel />}
          {active === 'users' && <AdminUsersPanel />}
          {active === 'orders' && <AdminOrdersPanel />}
          {active === 'delivery' && <AdminDeliveryPanel />}
          {active === 'withdrawals' && <AdminWithdrawalsPanel />}
          {active === 'payments' && <AdminPayments />}
          {active === 'ads' && <AdminAdsPanel />}
          {active === 'marketplaceBuilder' && <AdminMarketplaceBuilder />}
          {active === 'securityOps' && <SecurityOperationsDashboard />}
          {active === 'settings' && <AdminSettingsPanel />}
          {active === 'roles' && <AdminRolesPanel />}
          {active === 'chat' && <JedidaCommandCenter />}
          {active === 'ai' && <AICommandCenter />}
          {active === 'aiTraining' && <AdminAiTrainingCenter />}
          {active === 'settingsCenter' && <AdminSettingsCenter />}
          {active === 'chatBridge' && <AdminChatBridgePanel />}
          {active === 'questions' && <AdminQuestionsPanel />}
          {active === 'quotes' && <AdminQuotesPanel />}
          {active === 'partners' && <AdminPartnersPanel adminRole={user?.admin_role} />}
          {active === 'affiliates' && <AdminAffiliatePanel />}
          {active === 'disputes' && <AdminDisputesPanel />}
          {active === 'fraud' && <AdminFraudPanel />}
          {active === 'verification' && <AdminVerificationLevelsPanel />}
          {active === 'verifiedShops' && <AdminVerifiedShopsPanel />}
          {active === 'kycReview' && <AdminKycReviewPanel />}
          {active === 'apiCentre' && <AdminApiCentrePanel />}
        </>
      )}
    </AdminSidebarShell>
  );
}
