import { Link } from 'react-router-dom';
import DropdownShell from './DropdownShell';
import Icon from '../icons/icon';
import { logout } from '../../utils/auth';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}

// user comes from GET /auth/me — raw DB row (full_name, avatar_url,
// primary_role, is_admin, etc.), not the camelCase shape.
export default function UserMenu({ user }) {
  const dashboardLink = () => {
    if (user?.is_admin) return { to: '/admin', label: 'Admin Panel', icon: 'settings' };
    if (user?.primary_role === 'seller') return { to: '/seller', label: 'Seller Dashboard', icon: 'box' };
    if (['manufacturer', 'supplier'].includes(user?.primary_role)) return { to: '/seller', label: 'Business Dashboard', icon: 'factory' };
    if (user?.primary_role === 'dropshipper') return { to: '/seller', label: 'Dropship Dashboard', icon: 'share' };
    if (user?.primary_role === 'delivery') return { to: '/driver', label: 'Driver Dashboard', icon: 'truck' };
    if (user?.primary_role === 'host') return { to: '/host', label: 'Host Dashboard', icon: 'building' };
    return { to: '/seller/upgrade', label: 'Become a Seller', icon: 'star' };
  };
  const dash = dashboardLink();

  return (
    <DropdownShell
      width={260}
      trigger={({ open, toggle, close }) => (
        <button
          type="button"
          className={`jd-avatar-trigger ${open ? 'is-active' : ''}`}
          onClick={toggle}
          aria-label="Account menu"
        >
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="jd-avatar-img" />
          ) : (
            <span className="jd-avatar-fallback">{initials(user?.full_name)}</span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="jd-user-card">
            <div className="jd-avatar-fallback jd-avatar-fallback-lg">
              {user?.avatar_url ? <img src={user.avatar_url} alt="" className="jd-avatar-img" /> : initials(user?.full_name)}
            </div>
            <div>
              <div className="jd-user-card-name">{user?.full_name || 'Account'}</div>
              <div className="jd-user-card-email">{user?.email}</div>
            </div>
          </div>
          <div className="jd-menu-list">
            <Link to="/profile" className="jd-menu-row" onClick={close}>
              <Icon name="checkShield" size={16} />
              <span className="jd-menu-row-title">My Profile</span>
            </Link>
            <Link to="/orders" className="jd-menu-row" onClick={close}>
              <Icon name="bag" size={16} />
              <span className="jd-menu-row-title">My Orders</span>
            </Link>
            <Link to="/guest" className="jd-menu-row" onClick={close}>
              <Icon name="bag" size={16} />
              <span className="jd-menu-row-title">My Trips (Jedida Stays)</span>
            </Link>
            <Link to="/affiliate" className="jd-menu-row" onClick={close}>
              <Icon name="share" size={16} />
              <span className="jd-menu-row-title">Affiliate Program</span>
            </Link>
            <Link to={dash.to} className="jd-menu-row" onClick={close}>
              <Icon name={dash.icon} size={16} />
              <span className="jd-menu-row-title">{dash.label}</span>
            </Link>
          </div>
          <button type="button" className="jd-menu-footer-action jd-logout" onClick={logout}>
            <Icon name="logout" size={15} /> Sign out
          </button>
        </>
      )}
    </DropdownShell>
  );
}
