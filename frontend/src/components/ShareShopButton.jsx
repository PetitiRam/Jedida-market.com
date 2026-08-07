import { useState } from 'react';

// Instagram and TikTok have no web share-intent URL — there is no link that
// opens either app pre-filled with a URL to post. Rather than fake a button
// that silently does nothing useful, both copy the link and say so plainly.
const NO_SHARE_INTENT = new Set(['instagram', 'tiktok']);

function buildShareUrl(platform, url, title) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  switch (platform) {
    case 'facebook': return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    case 'whatsapp': return `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`;
    case 'x': return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
    case 'telegram': return `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`;
    case 'linkedin': return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    case 'email': return `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;
    default: return null;
  }
}

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook', icon: '📘' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'x', label: 'X', icon: '✖️' },
  { key: 'telegram', label: 'Telegram', icon: '📨' },
  { key: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { key: 'instagram', label: 'Instagram', icon: '📷' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵' },
  { key: 'email', label: 'Email', icon: '✉️' },
];

export default function ShareShopButton({ url, title }) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState('idle'); // idle | copied | copied-for-<platform>
  const [showQr, setShowQr] = useState(false);

  const handleShare = async (platform) => {
    if (NO_SHARE_INTENT.has(platform)) {
      await navigator.clipboard.writeText(url);
      setCopyState('copied-for-' + platform);
      setTimeout(() => setCopyState('idle'), 2500);
      return;
    }
    const shareUrl = buildShareUrl(platform, url, title);
    if (shareUrl) window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-secondary" onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        ↗ Share
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 50,
            background: '#fff', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            padding: 14, width: 260,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => handleShare(p.key)}
                title={NO_SHARE_INTENT.has(p.key) ? `${p.label} doesn't support direct link sharing — copies the link instead` : `Share on ${p.label}`}
                style={{ border: 'none', background: '#f7f7f7', borderRadius: 8, padding: '8px 4px', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                {p.icon}
              </button>
            ))}
          </div>

          {copyState.startsWith('copied-for-') && (
            <p style={{ fontSize: '0.72rem', color: 'var(--forest)', margin: '0 0 8px' }}>
              {copyState.replace('copied-for-', '')} doesn't support direct link sharing — link copied instead. Paste it into your bio, story, or caption.
            </p>
          )}

          <button className="btn-link" onClick={copyLink} style={{ fontSize: '0.85rem' }}>
            {copyState === 'copied' ? '✓ Link copied!' : '🔗 Copy link'}
          </button>
          <button className="btn-link" onClick={() => setShowQr((v) => !v)} style={{ fontSize: '0.85rem', marginLeft: 12 }}>
            {showQr ? 'Hide QR' : '▦ QR code'}
          </button>

          {showQr && (
            <div style={{ marginTop: 10, textAlign: 'center' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`}
                alt="QR code linking to this shop"
                width={180} height={180}
                style={{ borderRadius: 8, border: '1px solid var(--line)' }}
              />
              <p style={{ fontSize: '0.68rem', color: '#8A9189', marginTop: 4 }}>Generated via a third-party QR service — the shop URL is sent to it to render the code.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
