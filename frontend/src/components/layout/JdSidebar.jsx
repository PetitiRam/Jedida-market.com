import React from 'react';
import JdIcon from './JdIcons';
import { ROLE_NAV, ROLE_LABEL } from './roleNav';
import './jd-shell.css';

/**
 * Desktop/tablet sidebar. Drop-in replacement for <TabBar /> when rendering
 * on screens >= 960px. Keeps the same `tab` / `setTab` state your existing
 * dashboards already use — this only changes presentation, not routing.
 */
export default function JdSidebar({ role, items, activeTab, onSelect, shopName, collapsed, onToggleCollapse }) {
  const navItems = items || ROLE_NAV[role] || ROLE_NAV.seller;

  return (
    <aside className={`jd-sidebar ${collapsed ? 'jd-sidebar-collapsed' : ''}`} data-role={role}>
      <div className="jd-sidebar-brand">
        <span className="jd-brand-mark">J</span>
        {!collapsed && (
          <div className="jd-brand-text">
            <div className="jd-brand-name">Jedida <span>Market</span></div>
            <div className="jd-brand-shop">{shopName || ROLE_LABEL[role]}</div>
          </div>
        )}
      </div>

      <nav className="jd-sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`jd-sidebar-link ${activeTab === item.key ? 'active' : ''}`}
            onClick={() => onSelect(item.key)}
            title={collapsed ? item.label : undefined}
          >
            <JdIcon name={item.icon} size={18} />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      <button type="button" className="jd-sidebar-collapse-btn" onClick={onToggleCollapse}>
        <JdIcon name="chevronDown" size={16} className={collapsed ? 'rotate-90' : '-rotate-90'} />
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
