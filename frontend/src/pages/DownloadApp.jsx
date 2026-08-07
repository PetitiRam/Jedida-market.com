import { useEffect, useMemo, useState } from 'react';
import Logo from '../components/Logo';
import InstallAppButton from '../components/InstallAppButton';

// These map 1:1 to backend/src/routes/downloads.js's ALLOWED_FILES and the
// filenames CI produces in ci/.github/workflows/build-shell.yml — change a
// name in one place, change it everywhere.
const FILES = {
  android: 'jedida-marketplace.apk',
  windows: 'JEDIDA-Marketplace-Setup.exe',
  macos: 'JEDIDA-Marketplace.dmg',
  linux: 'JEDIDA-Marketplace.AppImage',
  linuxDeb: 'JEDIDA-Marketplace.deb'
};
const IOS_APP_STORE_URL = import.meta.env?.VITE_IOS_APP_STORE_URL || '';

const PLATFORM_META = {
  android: { label: 'Android', icon: '🤖' },
  ios: { label: 'iPhone / iPad', icon: '' },
  windows: { label: 'Windows', icon: '🪟' },
  macos: { label: 'macOS', icon: '' },
  linux: { label: 'Linux (AppImage)', icon: '🐧' },
  linuxDeb: { label: 'Linux (.deb — Debian/Ubuntu)', icon: '🐧' }
};

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/mac os x/i.test(ua) && !/iphone|ipad/i.test(ua)) return 'macos';
  if (/windows/i.test(ua)) return 'windows';
  if (/linux/i.test(ua)) return 'linux';
  return null;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function DownloadApp() {
  const detected = useMemo(detectPlatform, []);
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    fetch('/api/downloads/manifest/current')
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => setManifest({})); // network hiccup — cards just show unavailable
  }, []);

  const renderCard = (key) => {
    const meta = PLATFORM_META[key];
    const isRecommended = key === detected;

    if (key === 'ios') {
      const available = !!IOS_APP_STORE_URL;
      return (
        <Card key={key} meta={meta} isRecommended={isRecommended} available={available}
          sub={available ? 'App Store' : 'Coming soon'}
          href={IOS_APP_STORE_URL || undefined} download={false} />
      );
    }

    const filename = FILES[key];
    const entry = manifest?.[filename];
    const loading = manifest === null;
    const available = !loading && entry?.available;

    return (
      <Card key={key} meta={meta} isRecommended={isRecommended} available={available}
        sub={loading ? 'Checking…' : available ? formatSize(entry.sizeBytes) : 'Coming soon'}
        href={available ? `/downloads/${filename}` : undefined}
        download={key === 'android'} />
    );
  };

  const order = detected
    ? [detected, ...Object.keys(PLATFORM_META).filter((k) => k !== detected)]
    : Object.keys(PLATFORM_META);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream, #F6FBF7)' }}>
      <header style={{ display: 'flex', justifyContent: 'center', padding: '24px 48px' }}>
        <Logo size={36} />
      </header>

      <section style={{ padding: '24px 24px 80px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="eyebrow" style={{ display: 'flex', justifyContent: 'center' }}>Get the app</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Download JEDIDA Marketplace</h1>
          <p style={{ color: '#5B6760', margin: '16px 0 0' }}>
            The full marketplace, with a faster native experience. Always up to date
            automatically — no reinstalls needed for regular updates.
          </p>
        </div>

        <InstallAppButton />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0', color: '#8A9189', fontSize: '0.8rem' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--line, #E4E0D6)' }} />
          or download the native app
          <div style={{ flex: 1, height: 1, background: 'var(--line, #E4E0D6)' }} />
        </div>

        {order.map(renderCard)}

        <div style={{ marginTop: 24, background: '#fff', border: '1px solid var(--line, #E4E0D6)', borderRadius: 14, padding: 20, fontSize: '0.85rem', color: '#5B6760', lineHeight: 1.7 }}>
          <strong style={{ color: '#10241A' }}>About Android installs:</strong> this is a direct
          download outside the Play Store, so Android will show an "Install blocked" warning by
          default — tap Settings → allow installs from this source. This is expected and safe
          since you're downloading directly from jedidamarketplace.com.
        </div>
      </section>
    </div>
  );
}

function Card({ meta, href, download, available, sub, isRecommended }) {
  return (
    <a
      href={href}
      download={download && available}
      aria-disabled={!available}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px', borderRadius: 14,
        border: isRecommended ? '2px solid var(--terracotta, #2E7D32)' : '1px solid var(--line, #E4E0D6)',
        background: '#fff', textDecoration: 'none', color: 'inherit',
        opacity: available ? 1 : 0.5, pointerEvents: available ? 'auto' : 'none',
        marginBottom: 12
      }}
    >
      <span style={{ fontSize: 26 }}>{meta.icon}</span>
      <span style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>
          {meta.label} {isRecommended && <span style={{ color: 'var(--terracotta, #2E7D32)', fontSize: '0.75rem', fontWeight: 700 }}>· RECOMMENDED FOR YOU</span>}
        </div>
        <div style={{ fontSize: '0.85rem', color: '#8A9189' }}>{sub}</div>
      </span>
      <span style={{ fontSize: 20, opacity: available ? 0.6 : 0.3 }}>{available ? '⬇' : ''}</span>
    </a>
  );
}
