import React from 'react';
import JdIcon from './JdIcons';
import './jd-shell.css';

export default function JdTopBar({
  title,
  subtitle,
  searchPlaceholder = 'Search orders, products, customers…',
  onSearch,
  notificationCount = 0,
  messageCount = 0,
  userName,
  userRoleLabel,
  avatarUrl,
  primaryAction, // { label, icon, onClick }
}) {
  return (
    <header className="jd-topbar">
      <div className="jd-topbar-titles">
        <h1 className="jd-topbar-title">{title}</h1>
        {subtitle && <p className="jd-topbar-subtitle">{subtitle}</p>}
      </div>

      <div className="jd-topbar-search">
        <JdIcon name="search" size={16} />
        <input
          type="text"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>

      <div className="jd-topbar-actions">
        {primaryAction && (
          <button type="button" className="jd-btn jd-btn-primary" onClick={primaryAction.onClick}>
            <JdIcon name={primaryAction.icon || 'plus'} size={16} />
            {primaryAction.label}
          </button>
        )}
        <button type="button" className="jd-icon-btn" aria-label="Messages">
          <JdIcon name="messages" size={18} />
          {messageCount > 0 && <span className="jd-icon-badge">{messageCount}</span>}
        </button>
        <button type="button" className="jd-icon-btn" aria-label="Notifications">
          <JdIcon name="bell" size={18} />
          {notificationCount > 0 && <span className="jd-icon-badge">{notificationCount}</span>}
        </button>
        <button type="button" className="jd-icon-btn" aria-label="Help">
          <JdIcon name="help" size={18} />
        </button>
        <button type="button" className="jd-profile-menu">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="jd-avatar" />
          ) : (
            <span className="jd-avatar jd-avatar-fallback">{(userName || '?').charAt(0)}</span>
          )}
          <span className="jd-profile-text">
            <span className="jd-profile-name">{userName}</span>
            <span className="jd-profile-role">{userRoleLabel}</span>
          </span>
          <JdIcon name="chevronDown" size={14} />
        </button>
      </div>
    </header>
  );
}
