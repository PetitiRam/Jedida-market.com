import { Link } from 'react-router-dom';

const BANNERS = [
  {
    key: 'new', tone: 'forest', title: 'New Arrivals',
    sub: 'Check out the latest products just for you.',
    cta: 'Explore Now', href: '/marketplace?sort=newest',
  },
  {
    key: 'best', tone: 'amber', title: 'Best Sellers',
    sub: 'Shop our most popular products.',
    cta: 'Shop Now', href: '/marketplace?sort=popular',
  },
  {
    key: 'trending', tone: 'mint', title: 'Trending Now',
    sub: "See what's hot right now.",
    cta: 'Explore Now', href: '/trending',
  },
  {
    key: 'global', tone: 'sand', title: 'Global Store',
    sub: 'Shop from sellers around the world.',
    cta: 'Shop Now', href: '/marketplace?view=shops',
  },
  {
    key: 'trust', tone: 'deep', title: 'Jedida Trust Engine',
    sub: 'Shop with confidence. Verified. Trusted. Secure.',
    cta: 'Learn More', href: '/legal',
  },
];

export default function BottomBannerGrid() {
  return (
    <section className="home-section">
      <div className="jd-bottom-banners">
        {BANNERS.map((b) => (
          <Link key={b.key} to={b.href} className={`jd-bottom-banner tone-${b.tone}`}>
            <div>
              <strong>{b.title}</strong>
              <span>{b.sub}</span>
            </div>
            <span className="jd-bottom-banner-cta">{b.cta}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
