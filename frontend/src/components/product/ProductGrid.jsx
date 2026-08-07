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
  minColumnWidth = 200,
  onCardPress,
}) {
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
    gap: 16,
  };

  if (loading) {
    return (
      <div style={gridStyle}>
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
    <div style={gridStyle}>
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
