import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import ProductCard from '../ProductCard';

// Fixed card width for the rail. ProductCard/.product-card-v2 has no
// intrinsic width of its own by design — it's meant to be sized by a
// parent grid track (see .product-grid-v2) or, here, an explicit flex
// basis. Without that, a block-level card in an unconstrained flex row
// resolves to an oversized shrink-to-fit width, which is what was
// blowing up the image.
const CARD_WIDTH = 200;

export default function RelatedProductsCarousel({ category, currentProductId }) {
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    client.get('/products', { params: { category, sort: 'popular', limit: 12 } })
      .then(({ data }) => {
        if (cancelled) return;
        setProducts((data.products || []).filter((p) => p.id !== currentProductId));
      })
      .catch(() => {
        if (!cancelled) setProducts([]); // section just hides itself below
      });
    return () => { cancelled = true; };
  }, [category, currentProductId]);

  if (products.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ marginBottom: 16 }}>Related Products</h3>
      <div
        className="related-products-row"
        style={{
          display: 'flex',
          gap: 14,
          overflowX: 'auto',
          paddingBottom: 8,
          scrollSnapType: 'x proximity'
        }}
      >
        {products.map((p) => (
          <div
            key={p.id}
            style={{
              flex: `0 0 ${CARD_WIDTH}px`,
              width: CARD_WIDTH,
              scrollSnapAlign: 'start'
            }}
          >
            <ProductCard product={p} compact onPress={() => navigate(`/product/${p.id}`)} />
          </div>
        ))}
      </div>
    </div>
  );
}
