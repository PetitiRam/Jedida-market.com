import React, { useState } from 'react';
import JdSidebar from './JdSidebar';
import JdTopBar from './JdTopBar';
import JdBottomNav from './JdBottomNav';
import './jd-shell.css';

/**
 * Wraps a role dashboard's existing panel-switching logic. It does not
 * change how panels are chosen — it still just calls `onSelect(tabKey)`,
 * exactly like the old TabBar's onClick did — so existing `tab === 'x' ? <Panel/> : null`
 * rendering in SellerDashboard.jsx / DeliveryDashboard.jsx keeps working unchanged.
 *
 * Pass `items` (an array of {key,label,icon}) when a dashboard computes its
 * own role-specific tab list (e.g. SellerDashboard.jsx's navItemsForRole) —
 * it takes priority over the static ROLE_NAV[role] fallback in roleNav.js,
 * which only covers each role's fixed baseline tabs.
 *
 * Usage (inside e.g. SellerDashboard.jsx):
 *
 *   <JdDashboardShell
 *     role="seller"
 *     items={navItemsForRole(role)}
 *     activeTab={tab}
 *     onSelect={setTab}
 *     shopName={shop?.name}
 *     title="Overview"
 *     userName={user?.name}
 *     notificationCount={unreadCount}
 *     primaryAction={{ label: 'Add Product', icon: 'plus', onClick: () => setTab('add') }}
 *   >
 *     {tab === 'shop' && <ShopSetupPanel ... />}
 *     {tab === 'products' && <MyProductsPanel ... />}
 *     ...
 *   </JdDashboardShell>
 */
export default function JdDashboardShell({
  role,
  items,
  activeTab,
  onSelect,
  shopName,
  title,
  subtitle,
  userName,
  userRoleLabel,
  avatarUrl,
  notificationCount,
  messageCount,
  primaryAction,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="jd-shell" data-role={role}>
      <JdSidebar
        role={role}
        items={items}
        activeTab={activeTab}
        onSelect={onSelect}
        shopName={shopName}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <div className="jd-shell-main">
        <JdTopBar
          title={title}
          subtitle={subtitle}
          userName={userName}
          userRoleLabel={userRoleLabel}
          avatarUrl={avatarUrl}
          notificationCount={notificationCount}
          messageCount={messageCount}
          primaryAction={primaryAction}
        />
        <main className="jd-dashboard-content">{children}</main>
        <JdBottomNav role={role} items={items} activeTab={activeTab} onSelect={onSelect} />
      </div>
    </div>
  );
}
