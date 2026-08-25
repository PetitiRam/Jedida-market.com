import ProductCard from '../ProductCard';
import ProductCardSkeleton from './ProductCardSkeleton';

// Shared grid for anywhere a list of products needs to render as cards
// (Trending sections, Marketplace tabs, shop pages, search results, ...).
// Keeps ProductCard as the single source of truth for how a product looks.
export default function ProductGrid({
  products = [],
  loading = false,
  skeletonCount = 8,
  emptyMessage = 'No products found.',
  onCardPress,
}) {
  // Reuse the shared .product-grid-v2 pattern (theme.css) instead of an
  // ad-hoc inline grid: fixed column counts per breakpoint on desktop/
  // tablet, and the compact two-column mobile treatment below 760px.
  if (loading) {
    return (
      <div className="product-grid-v2">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="product-grid-v2">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onPress={onCardPress ? () => onCardPress(product) : undefined}
        />
      ))}
    </div>
  );
}
