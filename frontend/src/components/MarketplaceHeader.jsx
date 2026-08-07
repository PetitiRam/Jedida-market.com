import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useSecretTapGesture } from '../hooks/useSecretTapGesture';
import client from '../api/client';
import Logo from './Logo';
import * as commerceApi from '../api/commerceApi';
import Icon from './icons/icon';
import ThemeToggle from './ThemeToggle';
import AISearchBar from './home/AISearchBar';
import RippleIconButton from './header/RippleIconButton';
import CategoriesMenu from './header/CategoriesMenu';
import NotificationsMenu from './header/NotificationsMenu';
import MessagesMenu, { OPEN_CHAT_EVENT } from './header/MessagesMenu';
import WishlistMenu from './header/WishlistMenu';
import LanguageMenu from './header/LanguageMenu';
import DeliveryLocationMenu from './header/DeliveryLocationMenu';
import UserMenu from './header/UserMenu';
import { isAuthenticated } from '../utils/auth';
import '../styles/header.css';

// Marketing/utility nav row shown under the main bar — distinct from the
// account-scoped links (My Orders, Cart, etc.) in jd-header-controls.
const SECONDARY_NAV = [
  { to: '/marketplace?sort=deals', label: 'Deals', emoji: '🏷️' },
  { to: '/trending', label: 'Trending', emoji: '🔥' },
  { to: '/feed', label: 'Feed', emoji: '📣' },
  { to: '/stays', label: 'Stays', emoji: '🏡' },
  { to: '/marketplace?view=shops', label: 'Shops', icon: 'building' },
  { to: '/marketplace?category=services', label: 'Digital Services', icon: 'laptop' },
  { to: '/seller/upgrade', label: 'Sell on Jedida', icon: 'briefcase' },
];

function roleLabel(user) {
  if (!user) return '';
  if (user.is_admin) return 'Admin';
  const labels = {
    seller: 'Seller', manufacturer: 'Manufacturer', supplier: 'Supplier', dropshipper: 'Dropshipper',
    delivery: 'Delivery Partner', farmer: 'Farmer', host: 'Stays Host'
  };
  return labels[user.primary_role] || 'Buyer';
}

export default function MarketplaceHeader() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [logoOverride, setLogoOverride] = useState(null);
  // Hidden Developer & Partner Platform entry point — 12 consecutive taps on
  // the logo reveals it (never grants access on its own; see /developer/welcome).
  const registerLogoTap = useSecretTapGesture({
    taps: 12,
    onTrigger: () => navigate('/developer/welcome'),
  });
  const [cartCount, setCartCount] = useState(0);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const loggedIn = isAuthenticated();

  const refreshCart = () => commerceApi.getCart().then(({ data }) => setCartCount(data.count)).catch(() => {});

  useEffect(() => { refreshCart(); }, []);

  useEffect(() => {
    client.get('/auth/me').then(({ data }) => setUser(data.user)).catch(() => {});
    client.get('/site/theme').then(({ data }) => setLogoOverride(data?.theme?.logo_url || null)).catch(() => {});
  }, []);

  const openHelp = () => {
    // No dedicated Help Center page yet — the fastest real help is the
    // support chat that's already wired up app-wide, so route there.
    window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
  };

  return (
    <div className="jd-header-wrap">
      <header className="jd-header">
        <Link to="/" className="jd-logo-link" aria-label="JEDIDA Marketplace home" onClick={registerLogoTap}>
          <Logo size={30} overrideUrl={logoOverride} />
        </Link>

        <CategoriesMenu />

        <div className="jd-inline-search">
          <AISearchBar />
        </div>

        <DeliveryLocationMenu />

        <div className="jd-header-controls">
          <RippleIconButton
            label="Search"
            className="jd-search-toggle-btn"
            onClick={() => setMobileSearchOpen((v) => !v)}
            active={mobileSearchOpen}
          >
            <Icon name="search" size={18} />
          </RippleIconButton>

          <ThemeToggle />
          <LanguageMenu current={user?.preferred_language} onChange={(lang) => setUser((u) => (u ? { ...u, preferred_language: lang } : u))} />

          {loggedIn && (
            <>
              <WishlistMenu onCartChange={refreshCart} showLabel />
              <NotificationsMenu />
              <MessagesMenu showLabel />

              <Link to="/cart" className="jd-icon-stat" aria-label="Cart">
                <span className="jd-icon-stat-icon">
                  <span className="jd-icon-btn-glyph"><Icon name="cart" size={19} /></span>
                  {cartCount > 0 && <span className="jd-badge">{cartCount > 9 ? '9+' : cartCount}</span>}
                </span>
                <span className="jd-icon-stat-label">Cart</span>
              </Link>

              <div className="jd-user-block">
                <UserMenu user={user} />
                <div className="jd-user-greeting">
                  <span className="jd-user-greeting-name">Hi, {user?.full_name?.split(' ')[0] || 'there'}</span>
                  <span className="jd-user-greeting-role">{roleLabel(user)}</span>
                </div>
              </div>
            </>
          )}

          {!loggedIn && (
            <div className="jd-auth-links">
              <Link to="/signin" className="jd-nav-link">Sign In</Link>
              <Link to="/signup" className="jd-cta-btn">Create Account</Link>
            </div>
          )}
        </div>
      </header>

      {mobileSearchOpen && (
        <div className="jd-mobile-search-row">
          <AISearchBar />
        </div>
      )}

      <nav className="jd-secondary-nav" aria-label="Marketplace sections">
        <div className="jd-secondary-nav-inner">
          {SECONDARY_NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) => `jd-secondary-nav-link ${isActive ? 'is-active' : ''}`}
            >
              {item.emoji ? <span className="jd-secondary-nav-emoji">{item.emoji}</span> : <Icon name={item.icon} size={16} />}
              {item.label}
            </NavLink>
          ))}
          <button type="button" className="jd-secondary-nav-link jd-secondary-nav-btn" onClick={openHelp}>
            <Icon name="headset" size={16} />
            Help &amp; Support
          </button>
        </div>
      </nav>
    </div>
  );
}
