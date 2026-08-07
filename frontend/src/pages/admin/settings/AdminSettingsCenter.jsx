import TabBar from '../../../components/TabBar';
import PlatformIdentityTab from './PlatformIdentityTab';
import UpgradeSettingsTab from './UpgradeSettingsTab';
import PaymentSettingsTab from './PaymentSettingsTab';
import CommissionSettingsTab from './CommissionSettingsTab';
import AffiliateSettingsTab from './AffiliateSettingsTab';
import ShopProductSettingsTab from './ShopProductSettingsTab';
import UserSettingsTab from './UserSettingsTab';
import DeliverySettingsTab from './DeliverySettingsTab';
import AdsAiNotificationsTab from './AdsAiNotificationsTab';
import SecuritySettingsTab from './SecuritySettingsTab';
import LegalSettingsTab from './LegalSettingsTab';
import AboutBackupTab from './AboutBackupTab';
import MarketplaceRulesTab from './MarketplaceRulesTab';

const TABS = [
  { key: 'identity', label: 'Platform & Branding' },
  { key: 'upgrades', label: 'Upgrade Settings' },
  { key: 'payment', label: 'Payment' },
  { key: 'commission', label: 'Commissions' },
  { key: 'marketplaceRules', label: 'Marketplace Rules' },
  { key: 'affiliate', label: 'Affiliate Program' },
  { key: 'shopProduct', label: 'Shop & Product' },
  { key: 'user', label: 'Users' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'adsAi', label: 'Ads, AI & Notifications' },
  { key: 'security', label: 'Security' },
  { key: 'legal', label: 'Legal' },
  { key: 'about', label: 'About & Backup' }
];

export default function AdminSettingsCenter() {
  return (
    <div>
      <p style={{ color: '#5B6760', marginBottom: 12 }}>
        Every change here is validated, saved to PostgreSQL immediately, and logged in the audit trail.
      </p>
      <TabBar tabs={TABS} initial="identity">
        {(active) => {
          switch (active) {
            case 'identity': return <PlatformIdentityTab />;
            case 'upgrades': return <UpgradeSettingsTab />;
            case 'payment': return <PaymentSettingsTab />;
            case 'commission': return <CommissionSettingsTab />;
            case 'marketplaceRules': return <MarketplaceRulesTab />;
            case 'affiliate': return <AffiliateSettingsTab />;
            case 'shopProduct': return <ShopProductSettingsTab />;
            case 'user': return <UserSettingsTab />;
            case 'delivery': return <DeliverySettingsTab />;
            case 'adsAi': return <AdsAiNotificationsTab />;
            case 'security': return <SecuritySettingsTab />;
            case 'legal': return <LegalSettingsTab />;
            case 'about': return <AboutBackupTab />;
            default: return null;
          }
        }}
      </TabBar>
    </div>
  );
}
