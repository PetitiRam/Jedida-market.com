import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../icons/icon';

const PROTECTIONS = [
  { icon: 'checkShield', title: 'Buyer Protection', subtitle: 'Shop with confidence' },
  { icon: 'checkShield', title: 'Verified Sellers', subtitle: 'Trusted and verified' },
  { icon: 'truck', title: 'Fast Delivery', subtitle: 'Across Uganda' },
  { icon: 'settings', title: 'Easy Returns', subtitle: 'No stress returns' },
];

const COLLAGE_TILES = [
  { emoji: '👜', top: '2%', left: '0%' },
  { emoji: '🎧', top: '0%', left: '52%' },
  { emoji: '🥬', top: '30%', left: '4%' },
  { emoji: '🪑', top: '46%', left: '68%' },
  { emoji: '📱', top: '68%', left: '10%' },
];

function formatStat(n) {
  if (!n && n !== 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
  return `${n}+`;
}

export default function MarketplaceHero({ stats }) {
  const [term, setTerm] = useState('');
  const navigate = useNavigate();

  const submitSearch = (e) => {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `/marketplace?search=${encodeURIComponent(q)}` : '/marketplace');
  };

  const tiles = [
    { label: 'Products', value: formatStat(stats?.products) || '50K+' },
    { label: 'Verified Sellers', value: formatStat(stats?.sellers) || '15K+' },
    { label: 'Happy Customers', value: formatStat(stats?.customers) || '250K+' },
    { label: 'Countries', value: stats?.countries ? `${stats.countries}+` : '30+' },
  ];

  return (
    <section className="jd-hero">
      <div className="jd-hero-grid">
        {/* Left: copy + search + CTAs + stats */}
        <div className="jd-hero-copy">
          <span className="jd-hero-eyebrow">
            <Icon name="checkShield" size={14} /> Uganda&rsquo;s Trusted Marketplace
          </span>
          <h1 className="jd-hero-heading">
            Everything you need,<br />
            From <span className="jd-hero-heading-accent">local sellers you trust</span>
          </h1>
          <p className="jd-hero-sub">
            Shop thousands of quality products, support local businesses and enjoy secure delivery.
          </p>

          <form className="jd-hero-search" onSubmit={submitSearch}>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="What are you looking for?"
              aria-label="Search the marketplace"
            />
            <button type="submit">Search</button>
          </form>

          <div className="jd-hero-cta-row">
            <Link to="/marketplace" className="jd-hero-btn-primary">Shop Now</Link>
            <Link to="/seller/upgrade" className="jd-hero-btn-secondary">Start Selling</Link>
          </div>

          <div className="jd-hero-stats">
            {tiles.map((t) => (
              <div key={t.label} className="jd-hero-stat">
                <div className="jd-hero-stat-value">{t.value}</div>
                <div className="jd-hero-stat-label">{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle: illustrated collage + secure payments ribbon */}
        <div className="jd-hero-visual">
          <div className="jd-hero-collage">
            <div className="jd-hero-collage-center">🧑🏾‍🦱</div>
            {COLLAGE_TILES.map((t, i) => (
              <div key={i} className="jd-hero-collage-tile" style={{ top: t.top, left: t.left, animationDelay: `${i * 0.4}s` }}>
                {t.emoji}
              </div>
            ))}
          </div>
          <div className="jd-hero-secure-ribbon">
            <Icon name="checkShield" size={20} />
            <div>
              <strong>Secure Payments</strong>
              <span>Pay safely with Mobile Money or Cards</span>
            </div>
          </div>
        </div>

        {/* Right: buyer protection + become a seller */}
        <div className="jd-hero-side">
          <div className="jd-hero-protect-card">
            {PROTECTIONS.map((p) => (
              <div key={p.title} className="jd-hero-protect-row">
                <span className="jd-hero-protect-icon"><Icon name={p.icon} size={16} /></span>
                <div>
                  <div className="jd-hero-protect-title">{p.title}</div>
                  <div className="jd-hero-protect-sub">{p.subtitle}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="jd-hero-seller-card">
            <div className="jd-hero-seller-icon">🏪</div>
            <strong>Become a Seller</strong>
            <span>Grow your business with Jedida</span>
            <Link to="/seller/upgrade" className="jd-hero-seller-btn">Join Now</Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes jd-hero-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>
    </section>
  );
}
