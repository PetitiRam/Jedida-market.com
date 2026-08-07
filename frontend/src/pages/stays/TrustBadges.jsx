import { TRUST_BADGE_LABELS } from './staysConstants';

export default function TrustBadges({ badges, size = 'normal' }) {
  if (!Array.isArray(badges) || badges.length === 0) return null;
  const fontSize = size === 'small' ? '0.68rem' : '0.76rem';
  const padding = size === 'small' ? '2px 7px' : '3px 9px';
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {badges.map((b) => {
        const meta = TRUST_BADGE_LABELS[b] || { label: b, emoji: '🏅' };
        return (
          <span key={b} style={{ fontSize, padding, background: '#EEF4EF', borderRadius: 999, fontWeight: 600 }}>
            {meta.emoji} {meta.label}
          </span>
        );
      })}
    </div>
  );
}
