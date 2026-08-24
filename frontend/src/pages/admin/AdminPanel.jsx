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
import MobileAgentConsole from './MobileAgentConsole';
import useIsMobile from '../../hooks/useIsMobile';
import AICommandCenter from './AICommandCenter';
import AdminSettingsCenter from './settings/AdminSettingsCenter';
import AdminChatBridgePanel from './AdminChatBridgePanel';
import OmnichannelInboxPanel from './OmnichannelInboxPanel';
import AdminFactoryVerificationPanel from './AdminFactoryVerificationPanel';
import AdminInspectionsPanel from './AdminInspectionsPanel';
import AssignmentEnginePanel from './AssignmentEnginePanel';
import AdminLogisticsHubPanel from './AdminLogisticsHubPanel';
import CategoryAttributesPanel from './CategoryAttributesPanel';
import AnalyticsDashboard from './AnalyticsDashboard';
import AdminQuestionsPanel from './AdminQuestionsPanel';
import AdminQuotesPanel from './AdminQuotesPanel';
import AdminPayments from './AdminPayments';
import AdminProviderRegistryPanel from './AdminProviderRegistryPanel';
import AdminFeatureEnginePanel from './AdminFeatureEnginePanel';
import AdminDeliveryPanel from './AdminDeliveryPanel';
import AdminRolesPanel from './AdminRolesPanel';
import AgentGroupsPanel from './AgentGroupsPanel';
import AdminPartnersPanel from './AdminPartnersPanel';
import AdminAffiliatePanel from './AdminAffiliatePanel';
import AdminAiTrainingCenter from './AdminAiTrainingCenter';
import AdminDashboard from './AdminDashboard';
import AdminDisputesPanel from './AdminDisputesPanel';
import AdminFraudPanel from './AdminFraudPanel';
import AdminWantedPanel from './AdminWantedPanel';
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
  { key: 'assignmentEngine', label: '🗂️ Customer Groups & Assignment', area: 'users' },
  { key: 'orders', label: 'Orders & Payouts', area: 'orders' },
  { key: 'analytics', label: '📊 Analytics', area: 'orders' },
  { key: 'delivery', label: 'Delivery', area: 'delivery' },
  { key: 'withdrawals', label: 'Withdrawals', area: 'withdrawals' },
  { key: 'ads', label: 'Ads', area: 'ads' },
  { key: 'marketplaceBuilder', label: '🧩 Marketplace Builder', area: 'marketplace' },
  { key: 'securityOps', label: '🛡 Security Ops', area: 'security' },
  { key: 'settings', label: 'Settings', area: null }, // super admin only
  { key: 'roles', label: 'Roles & Permissions', area: null }, // super admin only
  { key: 'chat', label: '🛰️ Command Center', area: 'chat' },
  { key: 'agentGroups', label: '🧭 Agent Groups & Sectors', area: 'chat' },
  { key: 'ai', label: '🤖 AI Command Center', area: 'ai' },
  { key: 'aiTraining', label: '🎓 AI Training Center', area: 'ai' },
  { key: 'settingsCenter', label: '⚙️ Settings Center', area: null }, // super admin only
  { key: 'chatBridge', label: '🔗 Chat Bridging', area: 'chat' },
  { key: 'omnichannel', label: '📨 Omnichannel Inbox', area: 'chat' },
  { key: 'questions', label: '❓ Product Questions', area: 'products' },
  { key: 'quotes', label: 'Quote Requests', area: 'products' },
  { key: 'categoryAttributes', label: '🏷️ Category Attributes', area: 'products' },
  { key: 'payments', label: '💳 Payments', area: 'withdrawals' },
  { key: 'providerRegistry', label: '🏦 Provider Registry', area: 'withdrawals' },
  { key: 'featureEngine', label: '⚙️ Feature Control Center', area: 'upgrades' },
  { key: 'partners', label: '🤝 Partner Management', area: 'partners' },
  { key: 'affiliates', label: '🔗 Affiliate Program', area: 'affiliates' },
  { key: 'disputes', label: '⚖️ Disputes', area: 'disputes' },
  { key: 'fraud', label: '🚨 Fraud Signals', area: 'fraud' },
  { key: 'wanted', label: '📣 Jedida Wanted', area: 'wanted' },
  { key: 'verification', label: '✅ Verification Levels', area: 'upgrades' },
  { key: 'verifiedShops', label: '🛡️ Verified Shops', area: 'shops' },
  { key: 'kycReview', label: '🪪 KYC Verification Center', area: 'upgrades' },
  { key: 'factoryVerification', label: '🏭 Factory Verification', area: 'upgrades' },
  { key: 'inspections', label: '🔍 Inspections', area: 'upgrades' },
  { key: 'logisticsHub', label: '🚚 Logistics Hub', area: 'upgrades' },
  { key: 'apiCentre', label: '🔌 API Centre', area: null } // super admin only
];

// Mirrors the backend's ADMIN_ROLE_PERMISSIONS in middleware/auth.js — kept
// in one place here so adding a role only means updating two files, not
// hunting through every tab.
const ROLE_AREAS = {
  super_admin: ['*'],
  staff: ['orders', 'delivery', 'products'],
  moderator: ['products', 'shops', 'users', 'wanted'],
  support: ['chat', 'users'],
  finance: ['wallets', 'withdrawals', 'payments', 'orders', 'affiliates', 'disputes'],
  marketing: ['ads', 'campaigns', 'marketplace'],
  approvals: ['products', 'shops', 'upgrades', 'withdrawals', 'partners', 'affiliates'],
  ai_manager: ['ai'],
  chat_assistant: ['chat'],
  business_rep: ['chat', 'partners', 'shops'],
  security_agent: ['chat', 'users', 'products', 'disputes', 'fraud', 'security', 'wanted'],
};

function visibleTabs(adminRole) {
  if (!adminRole || adminRole === 'super_admin') return TABS; // legacy/full admin sees everything
  const allowed = ROLE_AREAS[adminRole] || [];
  return TABS.filter((t) => t.area === 'dashboard' ? true : t.area === null ? false : allowed.includes(t.area));
}
                                                                                                                                                                                                                                                                             
export default function AdminPanel() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const isMobile = useIsMobile();

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
          {active === 'assignmentEngine' && <AssignmentEnginePanel />}
          {active === 'orders' && <AdminOrdersPanel />}
          {active === 'analytics' && <AnalyticsDashboard />}
          {active === 'delivery' && <AdminDeliveryPanel />}
          {active === 'withdrawals' && <AdminWithdrawalsPanel />}
          {active === 'payments' && <AdminPayments />}
          {active === 'providerRegistry' && <AdminProviderRegistryPanel />}
          {active === 'featureEngine' && <AdminFeatureEnginePanel />}
          {active === 'ads' && <AdminAdsPanel />}
          {active === 'marketplaceBuilder' && <AdminMarketplaceBuilder />}
          {active === 'securityOps' && <SecurityOperationsDashboard />}
          {active === 'settings' && <AdminSettingsPanel />}
          {active === 'roles' && <AdminRolesPanel />}
          {active === 'chat' && (isMobile ? <MobileAgentConsole /> : <JedidaCommandCenter />)}
          {active === 'agentGroups' && <AgentGroupsPanel />}
          {active === 'ai' && <AICommandCenter />}
          {active === 'aiTraining' && <AdminAiTrainingCenter />}
          {active === 'settingsCenter' && <AdminSettingsCenter />}
          {active === 'chatBridge' && <AdminChatBridgePanel />}
          {active === 'omnichannel' && <OmnichannelInboxPanel />}
          {active === 'questions' && <AdminQuestionsPanel />}
          {active === 'quotes' && <AdminQuotesPanel />}
          {active === 'categoryAttributes' && <CategoryAttributesPanel />}
          {active === 'partners' && <AdminPartnersPanel adminRole={user?.admin_role} />}
          {active === 'affiliates' && <AdminAffiliatePanel />}
          {active === 'disputes' && <AdminDisputesPanel />}
          {active === 'fraud' && <AdminFraudPanel />}
          {active === 'wanted' && <AdminWantedPanel />}
          {active === 'verification' && <AdminVerificationLevelsPanel />}
          {active === 'verifiedShops' && <AdminVerifiedShopsPanel />}
          {active === 'kycReview' && <AdminKycReviewPanel />}
          {active === 'factoryVerification' && <AdminFactoryVerificationPanel />}
          {active === 'inspections' && <AdminInspectionsPanel />}
          {active === 'logisticsHub' && <AdminLogisticsHubPanel />}
          {active === 'apiCentre' && <AdminApiCentrePanel />}
        </>
      )}
    </AdminSidebarShell>
  );
}
