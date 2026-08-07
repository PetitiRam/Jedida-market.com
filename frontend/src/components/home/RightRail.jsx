import { Link } from 'react-router-dom';
import Icon from '../icons/icon';
import AdsBanner from '../AdsBanner';

// (Popular Brands now comes live from the feed — see PopularBrandsCard below —
// rather than a fixed list of names.)

function formatStat(n) {
  if (!n && n !== 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
  return `${n}+`;
}

function BecomeSellerCard() {
  return (
    <Link to="/seller/upgrade" className="jd-rail-card jd-rail-seller">
      <div className="jd-rail-seller-emoji">🏪</div>
      <div className="jd-rail-seller-copy">
        <strong>Become a Seller</strong>
        <span>Grow your business with Jedida</span>
      </div>
      <span className="jd-rail-seller-btn">Get Started</span>
    </Link>
  );
}

function PopularBrandsCard({ brands }) {
  if (!brands || brands.length === 0) return null;
  return (
    <div className="jd-rail-card">
      <div className="jd-rail-card-head">
        <span>Popular Brands</span>
        <Link to="/marketplace" className="jd-rail-viewall">View all</Link>
      </div>
      <div className="jd-rail-brands-grid">
        {brands.map((b) => (
          <Link key={b} to={`/marketplace?search=${encodeURIComponent(b)}`} className="jd-rail-brand-chip">
            {b}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DownloadAppCard() {
  return (
    <Link to="/download" className="jd-rail-card jd-rail-download">
      <div>
        <strong>Download the Jedida App</strong>
        <span>Shop on the go, anytime, anywhere.</span>
      </div>
      <div className="jd-rail-download-badges">
        <span className="jd-rail-download-badge"><Icon name="phone" size={13} /> Android APK</span>
        <span className="jd-rail-download-badge"><Icon name="phone" size={13} /> App Store</span>
      </div>
    </Link>
  );
}

function WhyShopCard({ stats }) {
  const tiles = [
    { icon: 'checkShield', label: 'Verified Sellers', value: formatStat(stats?.sellers) },
    { icon: 'heart', label: 'Happy Customers', value: formatStat(stats?.customers) },
    { icon: 'globe', label: 'Countries', value: stats?.countries ? `${stats.countries}+` : null },
    { icon: 'box', label: 'Products Listed', value: formatStat(stats?.products) },
  ].filter((t) => t.value);

  if (tiles.length === 0) return null;

  return (
    <div className="jd-rail-card">
      <div className="jd-rail-card-head"><span>Why Shop on Jedida?</span></div>
      <div className="jd-rail-why-grid">
        {tiles.map((t) => (
          <div key={t.label} className="jd-rail-why-tile">
            <span className="jd-rail-why-icon"><Icon name={t.icon} size={16} /></span>
            <strong>{t.value}</strong>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RightRail({ stats, brands }) {
  return (
    <aside className="jd-right-rail" aria-label="Promotions and platform stats">
      <AdsBanner placement="sidebar" title="Live Ads" height={190} />
      <BecomeSellerCard />
      <PopularBrandsCard brands={brands} />
      <DownloadAppCard />
      <WhyShopCard stats={stats} />
    </aside>
  );
}
