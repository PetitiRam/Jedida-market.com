import { useEffect, useState } from 'react';
import Logo from '../Logo';

// Covers the gap between "page loaded" and "app shell finished mounting" so
// the transition from the native splash screen (mobile) or splash.html
// (desktop) into the real UI is a fade, not a flash of an empty page. On
// mobile/desktop shells this overlaps briefly with the platform's own
// splash and disappears first frame after; on an installed PWA or the
// plain website it's the only splash there is, and it's brief enough
// (one animation frame + a short hold) not to feel like a loading screen.
export default function BootSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Hold for one paint cycle so the fade always has something to fade
    // from, then fade out. Never blocks on network — this is chrome, not
    // a data loading state.
    const fadeTimer = setTimeout(() => setFading(true), 220);
    const removeTimer = setTimeout(() => setVisible(false), 220 + 260);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`native-boot-splash${fading ? ' native-boot-splash--fading' : ''}`} aria-hidden="true">
      <Logo size={44} />
    </div>
  );
}
