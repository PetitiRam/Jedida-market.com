import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '../../api/client';
import Logo from '../../components/Logo';
import ThemeToggle from '../../components/ThemeToggle';
import TabBar from '../../components/TabBar';
import '../../styles/auth-v2.css';
import '../../styles/partner.css';

import OverviewPanel from './OverviewPanel';
import CompanyProfilePanel from './CompanyProfilePanel';
import IntegrationCenterPanel from './IntegrationCenterPanel';
import SandboxPanel from './SandboxPanel';
import SupportPanel from './SupportPanel';
import PortalNotificationsPanel from './PortalNotificationsPanel';
import SecurityPanel from './SecurityPanel';
import AuditLogPanel from './AuditLogPanel';
import DirectoryPanel from './DirectoryPanel';

const TABS = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'profile', label: 'Company Profile' },
  { key: 'integrations', label: 'Integration Center' },
  { key: 'sandbox', label: 'Sandbox' },
  { key: 'directory', label: 'Directory & Dropshipping' },
  { key: 'support', label: 'Support' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' },
  { key: 'audit', label: 'Audit Log' },
];

const STATUS_LABELS = {
  approved: 'Active Partner', suspended: 'Suspended', pending: 'Pending Review',
  under_review: 'Under Review', technical_review: 'Technical Review', business_review: 'Business Review',
  rejected: 'Rejected', on_hold: 'On Hold', more_info_requested: 'More Info Requested'
};

export default function PartnerPortalDashboard() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setUser(data.user)).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (user?.primary_role !== 'partner') return;
    client.get('/partner-portal/dashboard')
      .then(({ data }) => setDashboard(data))
      .catch((err) => setLoadError(err?.friendlyMessage || 'Could not load your partner dashboard.'));
  }, [user]);

  if (checked && (!user || user.primary_role !== 'partner')) {
    return <Navigate to="/signin" replace />;
  }

  const statusKey = dashboard?.partnership?.status;
  const statusClass = statusKey === 'approved' ? 'jd-portal-status-approved'
    : statusKey === 'suspended' ? 'jd-portal-status-suspended'
    : 'jd-portal-status-default';

  return (
    <div className="jd-partner">
      <span className="jd-partner-glow-a" />
      <span className="jd-partner-glow-b" />
      <div className="jd-partner-topbar">
        <Logo size={32} />
        <ThemeToggle />
      </div>

      <div className="jd-portal-shell">
        <div className="jd-portal-header">
          <div>
            <div className="jd-portal-header-title">Partner Portal</div>
            <div className="jd-portal-header-sub">
              {dashboard?.partnership?.companyName || '—'}
              {dashboard?.partnership?.referenceCode ? ` · ${dashboard.partnership.referenceCode}` : ''}
            </div>
          </div>
          {statusKey && (
            <span className={`jd-portal-status-badge ${statusClass}`}>
              {STATUS_LABELS[statusKey] || statusKey}
            </span>
          )}
        </div>

        {loadError && <div className="jd-portal-card"><div className="empty-state">{loadError}</div></div>}

        {!loadError && (
          <TabBar tabs={TABS} initial="overview">
            {(active) => (
              <>
                {active === 'overview' && <OverviewPanel dashboard={dashboard} onRefresh={() => client.get('/partner-portal/dashboard').then(({ data }) => setDashboard(data))} />}
                {active === 'profile' && <CompanyProfilePanel />}
                {active === 'integrations' && <IntegrationCenterPanel isActive={statusKey === 'approved'} />}
                {active === 'sandbox' && <SandboxPanel isActive={statusKey === 'approved'} />}
                {active === 'directory' && <DirectoryPanel isActive={statusKey === 'approved'} />}
                {active === 'support' && <SupportPanel />}
                {active === 'notifications' && <PortalNotificationsPanel />}
                {active === 'security' && <SecurityPanel />}
                {active === 'audit' && <AuditLogPanel />}
              </>
            )}
          </TabBar>
        )}
      </div>
    </div>
  );
}
