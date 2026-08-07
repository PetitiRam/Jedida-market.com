import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { jedidaNative } from './jedidaNativeBridge';
import { useTheme } from '../contexts/ThemeContext';
import BootSplashOverlay from '../components/native/BootSplashOverlay';

const EXIT_ROOT_PATHS = new Set(['/', '/marketplace']);
const DOUBLE_BACK_WINDOW_MS = 2000;

// Chrome-only wrapper: hardware back button, app foreground/background
// lifecycle, status bar color, and safe-area insets. Renders its children
// unchanged — it never touches routing, auth, or marketplace data, only
// how the shell around them behaves. A no-op on the regular website.
export default function NativeAppShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { resolved } = useTheme();
  const [exitToast, setExitToast] = useState(false);
  const lastBackPressRef = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;

  // Safe-area insets (notches, home indicators, gesture bars) as CSS vars
  // so any component can pad against them without hardcoding per-device
  // numbers. Real values only exist inside a native WebView; on web these
  // env() calls resolve to 0 and are harmless.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--safe-area-top', 'env(safe-area-inset-top, 0px)');
    root.style.setProperty('--safe-area-bottom', 'env(safe-area-inset-bottom, 0px)');
    if (jedidaNative.isNative()) root.classList.add('is-native-shell');
    if (jedidaNative.isDesktop()) root.classList.add('is-desktop-shell');
  }, []);

  // Status bar follows the site's own light/dark theme instead of staying
  // fixed, so it never clashes with whatever the page underneath is doing.
  useEffect(() => {
    jedidaNative.setStatusBarStyle({
      dark: resolved !== 'dark', // dark theme -> light (white) status bar icons
      backgroundColor: resolved === 'dark' ? '#062818' : '#0B3D24'
    });
  }, [resolved]);

  // Foreground/background: broadcast as a plain DOM event so any part of
  // the app (session refresh, unread-count polling, etc., added in later
  // phases) can subscribe without this file knowing about them.
  useEffect(() => {
    const unsubscribe = jedidaNative.onLifecycleChange((isActive) => {
      window.dispatchEvent(new CustomEvent(isActive ? 'jedida:foreground' : 'jedida:background'));
    });
    return unsubscribe;
  }, []);

  // Hardware back button: go back in-app history; at a root route, require
  // a second press within 2s to exit (standard Android pattern) instead of
  // quitting on a single accidental tap.
  useEffect(() => {
    const unsubscribe = jedidaNative.onBackButton(() => {
      const path = locationRef.current.pathname;
      if (!EXIT_ROOT_PATHS.has(path)) {
        navigate(-1);
        return;
      }
      const now = Date.now();
      if (now - lastBackPressRef.current < DOUBLE_BACK_WINDOW_MS) {
        jedidaNative.exitApp();
        return;
      }
      lastBackPressRef.current = now;
      jedidaNative.haptics.light();
      setExitToast(true);
      setTimeout(() => setExitToast(false), DOUBLE_BACK_WINDOW_MS);
    });
    return unsubscribe;
  }, [navigate]);

  return (
    <>
      <BootSplashOverlay />
      {children}
      {exitToast && (
        <div className="native-exit-toast" role="status">Press back again to exit</div>
      )}
    </>
  );
}
