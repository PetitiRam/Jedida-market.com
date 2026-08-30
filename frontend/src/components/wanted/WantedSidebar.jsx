import { Link, useLocation, useNavigate } from 'react-router-dom';
import JdIcon from '../layout/JdIcons';

// Left navigation rail for the Jedida Wanted screen — mirrors the app's
// primary sections. Every entry routes to a real, existing page; there is
// no dead/placeholder link here (see routing notes in App.jsx).
const NAV_ITEMS = [
  { key: 'home', label: 'Home', icon: 'dashboard', to: '/' },
  { key: 'explore', label: 'Explore', icon: 'search', to: '/marketplace' },
  { key: 'categories', label: 'Categories', icon: 'products', to: '/marketplace' },
  { key: 'orders', label: 'Orders', icon: 'orders', to: '/orders' },
  { key: 'wanted', label: 'Wanted', icon: 'imports', to: '/wanted' },
  { key: 'messages', label: 'Messages', icon: 'messages', to: '/notifications', badge: 2 },
  { key: 'notifications', label: 'Notifications', icon: 'bell', to: '/notifications', badge: 6 },
  { key: 'saved', label: 'Saved', icon: 'quality', to: '/buyer' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet', to: '/buyer' },
  { key: 'profile', label: 'Profile', icon: 'profile', to: '/profile' },
  { key: 'more', label: 'More', icon: 'more', to: '/legal' }
];

export default function WantedSidebar({ onPostWanted }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="wt-sidebar">
      <Link to="/" className="wt-sidebar-brand">
        <span className="wt-brand-mark">J</span>
        <span className="wt-brand-name">JEDIDA</span>
      </Link>

      <nav className="wt-sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const active = item.key === 'wanted'
            ? location.pathname.startsWith('/wanted')
            : location.pathname === item.to;
          return (
            <Link
              key={item.key}
              to={item.to}
              className={`wt-sidebar-link ${active ? 'active' : ''}`}
            >
              <JdIcon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.badge ? <span className="wt-sidebar-badge">{item.badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      <button type="button" className="wt-post-btn" onClick={onPostWanted}>
        <JdIcon name="plus" size={16} /> Post Wanted
      </button>

      <div className="wt-help-card">
        <div className="wt-help-title">Need help?</div>
        <div className="wt-help-sub">Chat with Jedida Agent</div>
        <button type="button" className="wt-help-chat" onClick={() => navigate('/notifications')}>
          <span className="wt-help-avatar">JA</span> Chat Now
        </button>
      </div>
    </aside>
  );
}
