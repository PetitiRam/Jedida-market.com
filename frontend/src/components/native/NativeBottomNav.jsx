import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { jedidaNative } from '../../native/jedidaNativeBridge';

// Small stroke-icon set so this doesn't pull in an icon library dependency
// the rest of the frontend doesn't already use.
const ICONS = {
  home: (
    <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-7.5Z" />
  ),
  cart: (
    <path d="M6 6h14l-1.5 8.5a2 2 0 0 1-2 1.5H9a2 2 0 0 1-2-1.97L5.2 4.6A1 1 0 0 0 4.2 4H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
  ),
  orders: (
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1Z" />
  ),
  account: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />
  )
};

function Icon({ name, active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--forest, #0B3D24)' : '#8A9189'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

// Tabs map only to routes that already exist in App.jsx — the nav is a
// chrome layer, not a new set of screens or logic. "Account" goes to
// /orders for a signed-in user (closest existing account-ish view) and to
// /signin otherwise; adjust this mapping when a dedicated profile page
// exists.
function useTabs() {
  const isAuthed = !!localStorage.getItem('jedida_access_token');
  return [
    { key: 'home', label: 'Home', path: '/', match: (p) => p === '/' || p === '/marketplace' },
    { key: 'cart', label: 'Cart', path: '/cart', match: (p) => p.startsWith('/cart') },
    { key: 'orders', label: 'Orders', path: '/orders', match: (p) => p.startsWith('/orders') },
    {
      key: 'account',
      label: isAuthed ? 'Account' : 'Sign in',
      path: isAuthed ? '/orders' : '/signin',
      match: (p) => p.startsWith('/signin') || p.startsWith('/signup')
    }
  ];
}

export default function NativeBottomNav() {
  const [show, setShow] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useTabs();

  useEffect(() => {
    setShow(jedidaNative.isNative()); // mobile shell only — desktop/web keep the existing header nav
  }, []);

  if (!show) return null;
  // Hide inside admin/seller/delivery dashboards — those have their own
  // in-page navigation and the tab bar would just compete for space.
  if (/^\/(admin|seller|delivery|driver)\b/.test(location.pathname)) return null;

  return (
    <nav className="native-bottom-nav" role="navigation" aria-label="Primary">
      {tabs.map((tab) => {
        const active = tab.match(location.pathname);
        return (
          <button
            key={tab.key}
            type="button"
            className={`native-bottom-nav__tab${active ? ' native-bottom-nav__tab--active' : ''}`}
            onClick={() => {
              jedidaNative.haptics.light();
              navigate(tab.path);
            }}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={tab.key} active={active} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
