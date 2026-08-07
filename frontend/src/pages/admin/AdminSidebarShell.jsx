import { useEffect, useMemo, useRef, useState } from 'react';
import client from '../../api/client';
import Icon from '../../components/icons/icon';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';
import { logout } from '../../utils/auth';
import '../../styles/admin-shell.css';

// Icon + group for every tab key registered in AdminPanel.jsx. A tab key
// with no entry here still renders (falls into "More"), so adding a new
// tab to AdminPanel never breaks the shell.
const TAB_META = {
  dashboard: { icon: 'grid', group: null, plain: 'Mission Control' },
  shops: { icon: 'building', group: 'Marketplace' },
  products: { icon: 'box', group: 'Marketplace' },
  verifiedShops: { icon: 'checkShield', group: 'Marketplace' },
  marketplaceBuilder: { icon: 'grid', group: 'Marketplace' },
  partners: { icon: 'handshake', group: 'Marketplace' },
  users: { icon: 'user', group: 'Users & Trust' },
  upgrades: { icon: 'star', group: 'Users & Trust' },
  verification: { icon: 'checkShield', group: 'Users & Trust' },
  kycReview: { icon: 'fileCheck', group: 'Users & Trust' },
  roles: { icon: 'lock', group: 'Users & Trust' },
  orders: { icon: 'cart', group: 'Orders & Fulfilment' },
  delivery: { icon: 'truck', group: 'Orders & Fulfilment' },
  questions: { icon: 'message', group: 'Orders & Fulfilment' },
  quotes: { icon: 'document', group: 'Orders & Fulfilment' },
  disputes: { icon: 'alertCircle', group: 'Trust & Safety' },
  fraud: { icon: 'shield', group: 'Trust & Safety' },
  withdrawals: { icon: 'bank', group: 'Finance' },
  payments: { icon: 'card', group: 'Finance' },
  affiliates: { icon: 'share', group: 'Finance' },
  ads: { icon: 'sparkle', group: 'Marketing' },
  chat: { icon: 'message', group: 'AI & Support' },
  chatBridge: { icon: 'message', group: 'AI & Support' },
  ai: { icon: 'sparkle', group: 'AI & Support' },
  aiTraining: { icon: 'sparkle', group: 'AI & Support' },
  securityOps: { icon: 'shield', group: 'Security & System' },
  settings: { icon: 'settings', group: 'Security & System' },
  settingsCenter: { icon: 'settings', group: 'Security & System' },
  apiCentre: { icon: 'globe', group: 'Developers' },
};
const GROUP_ORDER = ['Marketplace', 'Orders & Fulfilment', 'Users & Trust', 'Trust & Safety', 'Finance', 'Marketing', 'AI & Support', 'Developers', 'Security & System'];

const LS_KEYS = {
  collapsed: 'jedida_admin_sidebar_collapsed',
  favorites: 'jedida_admin_favorites',
  recent: 'jedida_admin_recent',
};

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable — non-fatal */ }
}

function initials(name) {
  if (!name) return 'A';
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export default function AdminSidebarShell({ tabs, initial, user, children }) {
  const [active, setActiveState] = useState(initial || tabs[0]?.key);
  const [collapsed, setCollapsed] = useState(() => readLS(LS_KEYS.collapsed, false));
  const [favorites, setFavorites] = useState(() => readLS(LS_KEYS.favorites, []));
  const [recent, setRecent] = useState(() => readLS(LS_KEYS.recent, []));
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [maintenance, setMaintenance] = useState(null);
  const [emergency, setEmergency] = useState(null);
  const [now, setNow] = useState(new Date());
  const [version, setVersion] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const searchRef = useRef(null);

  const isSuperAdmin = !user?.admin_role || user.admin_role === 'super_admin';

  const setActive = (key) => {
    setActiveState(key);
    setRecent((prev) => {
      const next = [key, ...prev.filter((k) => k !== key)].slice(0, 6);
      writeLS(LS_KEYS.recent, next);
      return next;
    });
    setQuery('');
    setSearchFocused(false);
  };

  const toggleFavorite = (key, e) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      writeLS(LS_KEYS.favorites, next);
      return next;
    });
  };

  const toggleCollapsed = () => setCollapsed((v) => { writeLS(LS_KEYS.collapsed, !v); return !v; });

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Real version + maintenance status, fetched once and refreshed on an interval
  useEffect(() => {
    let alive = true;
    const pull = () => {
      client.get('/version').then(({ data }) => { if (alive) setVersion(data.version); }).catch(() => {});
      client.get('/admin/settings-center/section/maintenance').then(({ data }) => { if (alive) setMaintenance(data.value); }).catch(() => {});
      client.get('/admin/settings-center/section/emergency').then(({ data }) => { if (alive) setEmergency(data.value); }).catch(() => {});
    };
    pull();
    const t = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Real notifications for the signed-in admin
  const loadNotifications = () => {
    client.get('/notifications/mine?pageSize=8').then(({ data }) => setNotifications(data.notifications || [])).catch(() => {});
  };
  useEffect(() => {
    loadNotifications();
    const t = setInterval(loadNotifications, 45000);
    return () => clearInterval(t);
  }, []);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markNotificationRead = (n) => {
    if (!n.is_read) {
      client.post(`/notifications/${n.id}/read`).then(() => {
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      }).catch(() => {});
    }
  };

  const changeLanguage = (lang) => {
    client.patch('/auth/me/language', { language: lang }).catch(() => {});
  };

  const toggleMaintenanceQuick = async () => {
    const next = !maintenance?.maintenanceMode;
    if (!window.confirm(next ? 'Enable maintenance mode platform-wide?' : 'Disable maintenance mode?')) return;
    try {
      const { data } = await client.patch('/admin/settings-center/section/maintenance', {
        maintenanceMode: next,
        maintenanceMessage: maintenance?.maintenanceMessage || 'Jedida Market is undergoing scheduled maintenance.',
      });
      setMaintenance(data.value || { ...maintenance, maintenanceMode: next });
    } catch { /* surfaced via the Mission Control panel's own toast if opened there */ }
  };

  const EMERGENCY_LABELS = {
    paymentsFrozen: 'Freeze payments',
    partnerApisDisabled: 'Disable partner APIs',
    loginDisabled: 'Disable login (non-admins)',
    withdrawalsFrozen: 'Freeze withdrawals',
  };
  const toggleEmergencyFlag = async (flag) => {
    const next = !emergency?.[flag];
    if (!window.confirm(`${next ? 'Enable' : 'Disable'} "${EMERGENCY_LABELS[flag]}" platform-wide?`)) return;
    try {
      const { data } = await client.patch('/admin/settings-center/section/emergency', { [flag]: next });
      setEmergency(data.value || { ...emergency, [flag]: next });
    } catch { /* real endpoint failure — button stays in its last-known state */ }
  };

  const forceLogoutAll = async () => {
    if (!window.confirm('This immediately signs out every user on every device platform-wide. Continue?')) return;
    try { await client.post('/admin/security/force-logout-all'); window.alert('All sessions revoked.'); }
    catch { window.alert('Could not force logout — check permissions.'); }
  };

  // Group tabs (already permission-filtered upstream) by TAB_META
  const grouped = useMemo(() => {
    const dashboardTab = tabs.find((t) => t.key === 'dashboard');
    const rest = tabs.filter((t) => t.key !== 'dashboard');
    const byGroup = {};
    rest.forEach((t) => {
      const meta = TAB_META[t.key] || { icon: 'grid', group: 'More' };
      const g = meta.group || 'More';
      byGroup[g] = byGroup[g] || [];
      byGroup[g].push({ ...t, icon: meta.icon });
    });
    return { dashboardTab, byGroup };
  }, [tabs]);

  const allSearchable = useMemo(() => tabs.map((t) => ({ ...t, icon: (TAB_META[t.key] || {}).icon || 'grid' })), [tabs]);
  const searchMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return allSearchable.filter((t) => t.label.toLowerCase().replace(/[^a-z ]/g, '').includes(q)).slice(0, 8);
  }, [query, allSearchable]);

  const favoriteTabs = favorites.map((k) => allSearchable.find((t) => t.key === k)).filter(Boolean);
  const recentTabs = recent.filter((k) => k !== active).map((k) => allSearchable.find((t) => t.key === k)).filter(Boolean).slice(0, 4);

  const reorderFavorites = (fromKey, toKey) => {
    if (fromKey === toKey) return;
    setFavorites((prev) => {
      const next = [...prev];
      const from = next.indexOf(fromKey);
      const to = next.indexOf(toKey);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, fromKey);
      writeLS(LS_KEYS.favorites, next);
      return next;
    });
  };

  const NavItem = ({ tab, draggableFav }) => (
    <li>
      <button
        type="button"
        className={`ash-nav-item ${active === tab.key ? 'active' : ''} ${dragKey === tab.key ? 'dragging' : ''}`}
        onClick={() => setActive(tab.key)}
        title={collapsed ? tab.label.replace(/^\S+\s/, '') : undefined}
        draggable={draggableFav}
        onDragStart={draggableFav ? () => setDragKey(tab.key) : undefined}
        onDragOver={draggableFav ? (e) => e.preventDefault() : undefined}
        onDrop={draggableFav ? () => { reorderFavorites(dragKey, tab.key); setDragKey(null); } : undefined}
        onDragEnd={draggableFav ? () => setDragKey(null) : undefined}
      >
        <span className="ash-nav-icon"><Icon name={tab.icon} size={16} /></span>
        <span className="ash-nav-label">{tab.label.replace(/^\S+\s/, '')}</span>
        <span
          className={`ash-star-btn ${favorites.includes(tab.key) ? 'favorited' : ''}`}
          role="button"
          tabIndex={-1}
          onClick={(e) => toggleFavorite(tab.key, e)}
          title={favorites.includes(tab.key) ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Icon name={favorites.includes(tab.key) ? 'starFilled' : 'star'} size={13} />
        </span>
      </button>
    </li>
  );

  return (
    <div className="ash-root">
      <aside className={`ash-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="ash-brand">
          <Logo size={28} />
          <div className="ash-brand-text"><b>Jedida</b><span>Mission Control</span></div>
          <button type="button" className="ash-collapse-btn" onClick={toggleCollapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
          </button>
        </div>

        <div className="ash-sidebar-scroll">
          {grouped.dashboardTab && (
            <ul className="ash-nav" style={{ marginBottom: 6 }}>
              <NavItem tab={{ ...grouped.dashboardTab, icon: 'grid', label: '📊 Mission Control' }} />
            </ul>
          )}

          {favoriteTabs.length > 0 && (
            <>
              <div className="ash-group-label">Favorites</div>
              <ul className="ash-nav">
                {favoriteTabs.map((t) => <NavItem key={t.key} tab={t} draggableFav />)}
              </ul>
            </>
          )}

          {recentTabs.length > 0 && (
            <>
              <div className="ash-group-label">Recent</div>
              <ul className="ash-nav">
                {recentTabs.map((t) => <NavItem key={t.key} tab={t} />)}
              </ul>
            </>
          )}

          {GROUP_ORDER.filter((g) => grouped.byGroup[g]?.length).map((g) => (
            <div key={g}>
              <div className="ash-group-label">{g}</div>
              <ul className="ash-nav">
                {grouped.byGroup[g].map((t) => <NavItem key={t.key} tab={t} />)}
              </ul>
            </div>
          ))}
          {grouped.byGroup.More?.length > 0 && (
            <div>
              <div className="ash-group-label">More</div>
              <ul className="ash-nav">{grouped.byGroup.More.map((t) => <NavItem key={t.key} tab={t} />)}</ul>
            </div>
          )}
        </div>

        <div className="ash-sidebar-footer">
          <ul className="ash-nav">
            <li>
              <button type="button" className="ash-nav-item" onClick={logout}>
                <span className="ash-nav-icon"><Icon name="logout" size={16} /></span>
                <span className="ash-nav-label">Logout</span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <div className="ash-main">
        <div className="ash-topbar">
          <div className="ash-search-wrap" ref={searchRef}>
            <span className="ash-search-icon"><Icon name="search" size={15} /></span>
            <input
              placeholder="Search users, orders, products, shops, payments…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            />
            {searchFocused && query.trim() && (
              <div className="ash-search-results">
                {searchMatches.length ? searchMatches.map((t) => (
                  <button key={t.key} onClick={() => setActive(t.key)}>
                    <Icon name={t.icon} size={14} /> {t.label.replace(/^\S+\s/, '')}
                  </button>
                )) : <div className="ash-dropdown-empty">No matching admin screens.</div>}
              </div>
            )}
          </div>

          <div className="ash-topbar-spacer" />

          {maintenance && (
            <span className={`ash-status-pill ${maintenance.maintenanceMode ? 'ash-status-maintenance' : 'ash-status-live'}`}>
              <Icon name={maintenance.maintenanceMode ? 'lock' : 'checkCircle'} size={12} />
              {maintenance.maintenanceMode ? 'Maintenance' : 'Live'}
            </span>
          )}

          <select className="ash-select" defaultValue={user?.preferred_language || 'en'} onChange={(e) => changeLanguage(e.target.value)} title="Preferred language">
            <option value="en">EN</option>
            <option value="fr">FR</option>
            <option value="sw">SW</option>
            <option value="lg">LG</option>
            <option value="xog">XOG</option>
          </select>

          <ThemeToggle />

          <div className="ash-dropdown-wrap">
            <button type="button" className="ash-icon-btn" onClick={() => setNotifOpen((v) => !v)} title="Notifications">
              <Icon name="bell" size={16} />
              {unreadCount > 0 && <span className="ash-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {notifOpen && (
              <div className="ash-dropdown">
                <div className="ash-dropdown-head">Notifications</div>
                <div className="ash-dropdown-list">
                  {notifications.length ? notifications.map((n) => (
                    <div key={n.id} className={`ash-dropdown-item ${!n.is_read ? 'unread' : ''}`} onClick={() => markNotificationRead(n)}>
                      {n.title || n.message}
                      <div className="t">{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  )) : <div className="ash-dropdown-empty">No notifications yet.</div>}
                </div>
              </div>
            )}
          </div>

          <button type="button" className="ash-icon-btn" onClick={() => setActive('ai')} title="AI Assistant">
            <Icon name="sparkle" size={16} />
          </button>

          {isSuperAdmin && (
            <div className="ash-dropdown-wrap">
              <button type="button" className="ash-icon-btn ash-emergency-btn" onClick={() => setEmergencyOpen((v) => !v)} title="Emergency controls">
                <Icon name="alertCircle" size={16} />
              </button>
              {emergencyOpen && (
                <div className="ash-dropdown">
                  <div className="ash-dropdown-head">Emergency Controls</div>
                  <div className="ash-emergency-panel">
                    <div className="row">
                      <button type="button" onClick={toggleMaintenanceQuick}>
                        {maintenance?.maintenanceMode ? 'Turn off maintenance mode' : 'Turn on maintenance mode'}
                      </button>
                      {emergency && Object.keys(EMERGENCY_LABELS).map((flag) => (
                        <button
                          key={flag}
                          type="button"
                          className={emergency[flag] ? 'danger' : ''}
                          onClick={() => toggleEmergencyFlag(flag)}
                        >
                          {emergency[flag] ? `${EMERGENCY_LABELS[flag]}: ON — tap to turn off` : `${EMERGENCY_LABELS[flag]}: off — tap to turn on`}
                        </button>
                      ))}
                      <button type="button" className="danger" onClick={forceLogoutAll}>Force logout everyone</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <span className="ash-clock">{now.toLocaleTimeString()}</span>
          {version && <span className="ash-version">v{version}</span>}

          <div className="ash-admin-chip">
            <div className="ash-admin-avatar">
              {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : initials(user?.full_name)}
            </div>
            <div className="ash-admin-meta">
              <b>{user?.full_name || 'Administrator'}</b>
              <span>{(user?.admin_role || 'super admin').replace(/_/g, ' ')}</span>
            </div>
          </div>
        </div>

        <div className="ash-content">
          {children(active)}
        </div>
      </div>
    </div>
  );
}
