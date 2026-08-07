import { useEffect, useState } from 'react';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
const isStandaloneAlready = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true; // iOS Safari's own flag

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandaloneAlready());
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault(); // stop Chrome's automatic mini-infobar
      setDeferredPrompt(event); // keep it to trigger on our own button tap
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (isIOS()) {
      setShowIOSInstructions(true);
      return;
    }
    if (!deferredPrompt) return; // browser hasn't offered installability yet
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice; // 'accepted' | 'dismissed'
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  // On non-iOS browsers that haven't fired beforeinstallprompt yet (already
  // installed some other way, or an unsupported browser like Firefox
  // desktop), there's nothing real to offer — stay hidden rather than show
  // a button that does nothing when tapped.
  if (!isIOS() && !deferredPrompt) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={handleClick}
        className="btn-primary"
        style={{ width: '100%', padding: '16px', fontSize: '1.05rem', fontWeight: 700 }}
      >
        ⬇ Install JEDIDA Marketplace
      </button>
      <p style={{ fontSize: '0.8rem', color: '#8A9189', textAlign: 'center', marginTop: 8 }}>
        Installs instantly in your browser — works offline-friendly, opens like a
        real app, no app-store wait.
      </p>

      {showIOSInstructions && (
        <div style={{ marginTop: 12, background: '#fff', border: '1px solid var(--line, #E4E0D6)', borderRadius: 12, padding: 16, fontSize: '0.88rem', color: '#5B6760', lineHeight: 1.7 }}>
          <strong style={{ color: '#10241A' }}>On iPhone/iPad:</strong> tap the Share
          icon in Safari's toolbar, then "Add to Home Screen". JEDIDA Marketplace
          will open full-screen from your home screen from then on.
        </div>
      )}
    </div>
  );
}
