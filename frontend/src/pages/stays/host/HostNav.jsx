import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/host', label: 'Overview' },
  { to: '/host/properties', label: 'Properties' },
  { to: '/host/bookings', label: 'Reservations' },
  { to: '/host/reviews', label: 'Reviews' },
];

export default function HostNav() {
  const { pathname } = useLocation();
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #EDEFEC' }}>
      {TABS.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            style={{
              padding: '8px 4px', marginRight: 16, textDecoration: 'none',
              color: active ? '#1E293B' : '#8A9189', fontWeight: active ? 700 : 400,
              borderBottom: active ? '2px solid #1E293B' : '2px solid transparent',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
