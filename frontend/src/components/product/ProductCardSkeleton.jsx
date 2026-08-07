export default function ProductCardSkeleton() {
  return (
    <div className="skeleton-card" style={{ background: 'var(--surface)' }}>
      <div className="skeleton skeleton-img" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-line" style={{ width: '40%', height: 18 }} />
    </div>
  );
}
