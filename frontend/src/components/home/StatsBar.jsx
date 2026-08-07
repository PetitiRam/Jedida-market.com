export default function StatsBar({ stats }) {
  if (!stats) return null;
  const tiles = [
    { key: 'products', label: 'Products', value: stats.products },
    { key: 'sellers', label: 'Verified Sellers', value: stats.sellers },
    { key: 'customers', label: 'Happy Customers', value: stats.customers },
    { key: 'countries', label: 'Countries', value: stats.countries }
  ].filter((t) => t.value > 0);

  if (tiles.length === 0) return null;

  const format = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+` : `${n}`);

  return (
    <div className="stats-bar">
      {tiles.map((t) => (
        <div className="stat-tile" key={t.key}>
          <div className="stat-tile-value">{format(t.value)}</div>
          <div className="stat-tile-label">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
