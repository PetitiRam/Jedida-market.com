import Icon from '../icons/icon';

const BADGES = [
  { key: 'checkShield', label: 'Verified Shop', condition: (s) => s.shop_is_verified },
  { key: 'factory', label: 'Verified Manufacturer', condition: (s) => s.verified_manufacturer },
  { key: 'shield', label: 'Secure Payments', condition: () => true },
  { key: 'checkShield', label: 'Escrow Protection', condition: () => true },
  { key: 'users', label: 'Buyer Protection', condition: () => true },
  { key: 'truck', label: 'Fast Delivery', condition: () => true },
  { key: 'starFilled', label: 'Quality Guaranteed', condition: () => true },
  { key: 'checkShield', label: 'Marketplace Verified', condition: () => true }
];

export default function TrustBadges({ specs = {}, shopIsVerified = false }) {
  const conditionInput = { ...specs, shop_is_verified: shopIsVerified };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
      {BADGES.filter((b) => b.condition(conditionInput)).map((b) => (
        <div key={b.label} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cream-dim)',
          padding: '6px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600
        }}>
          <Icon name={b.key} size={14} />
          {b.label}
        </div>
      ))}
    </div>
  );
}
