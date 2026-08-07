import MarketplaceHeader from '../../components/MarketplaceHeader';
import TrendingSection from '../../components/product/TrendingSection';
import { TRENDING_SECTIONS } from '../../constants/trendingSections';

export default function TrendingProducts() {
  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2>Trending Products</h2>
        <p style={{ color: '#5B6760', marginTop: -8, marginBottom: 24 }}>
          What's popular across the marketplace right now.
        </p>

        {TRENDING_SECTIONS.map((section) => (
          <TrendingSection
            key={section.key}
            section={section}
            seeAllHref={section.sort ? `/marketplace?sort=${section.sort}` : undefined}
          />
        ))}
      </div>
    </div>
  );
}
