import Icon from '../icons/icon';

const ITEMS = [
  { icon: 'lock', title: 'Secure Payments', sub: '100% secure transactions' },
  { icon: 'truck', title: 'Buyer Protection', sub: 'Shop with confidence' },
  { icon: 'refresh', title: 'Easy Returns', sub: 'Hassle-free returns' },
  { icon: 'headset', title: '24/7 Support', sub: "We're here to help" },
];

export default function TrustStrip() {
  return (
    <div className="jd-trust-strip">
      {ITEMS.map((it) => (
        <div key={it.title} className="jd-trust-item">
          <span className="jd-trust-icon"><Icon name={it.icon} size={18} /></span>
          <div>
            <strong>{it.title}</strong>
            <span>{it.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
