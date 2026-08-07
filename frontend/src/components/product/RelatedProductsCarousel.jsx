import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import ProductCard from '../ProductCard';

export default function RelatedProductsCarousel({ category, currentProductId }) {
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/products', { params: { category, sort: 'popular', limit: 12 } })
      .then(({ data }) => setProducts((data.products || []).filter((p) => p.id !== currentProductId)));
  }, [category, currentProductId]);

  if (products.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ marginBottom: 16 }}>Related Products</h3>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
        {products.map((p) => (
          <div key={p.id} style={{ minWidth: 180, flexShrink: 0 }}>
            <ProductCard product={p} onPress={() => navigate(`/product/${p.id}`)} />
          </div>
        ))}
      </div>
    </div>
  );
}
