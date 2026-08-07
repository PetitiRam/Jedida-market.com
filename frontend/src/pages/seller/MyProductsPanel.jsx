import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import AddProductPanel from './AddProductPanel';

export default function MyProductsPanel() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editProduct, setEditProduct] = useState(null);

  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/products/mine');
      setProducts(data.products || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const removeProduct = async (id) => {
    if (!confirm('Remove this listing?')) return;
    await client.delete(`/products/${id}`);
    load();
  };

  const getProductImage = (p) => {
    if (Array.isArray(p.images) && p.images.length > 0) {
      const image = p.images[0];

      if (typeof image === 'string') return image;

      if (image?.url) return image.url;
    }

    if (p.image_url) return p.image_url;

    return '/placeholder-product.png';
  };


  if (loading)
    return <div className="empty-state">Loading your products…</div>;


  if (products.length === 0) {
    return (
      <div className="empty-state">
        You haven't listed any products yet. Use "Add Product" to create your first listing.
      </div>
    );
  }


  return (
    <div className="product-grid">

      {products.map((p) => (

        <div className="product-card" key={p.id}>

          <div className="product-card-image">

            <img
              src={getProductImage(p)}
              alt={p.title}
              onError={(e) => {
                e.currentTarget.src = '/placeholder-product.png';
              }}
            />

          </div>


          <div className="product-card-body">

            <span
              className={`status-chip status-${p.status}`}
              style={{ width: 'fit-content' }}
            >
              {p.status?.replace('_', ' ')}
            </span>


            <div className="product-card-title">
              {p.title}
            </div>


            <div className="product-card-price">
              {p.currency} {Number(p.price).toLocaleString()}
            </div>


            <div className="product-card-meta">
              {p.views_count || 0} views · {p.orders_count || 0} orders
            </div>


            {p.ai_polished && (
              <div className="product-card-meta">
                ✨ Polished by Nsubuga Joseph
              </div>
            )}


            <button
              className="btn-secondary"
              style={{ marginTop: 6 }}
              onClick={() => setEditProduct(p)}
            >
              Edit
            </button>


            <button
              className="btn-secondary"
              style={{ marginTop: 6 }}
              onClick={() => navigate(`/product/${p.id}`)}
            >
              Preview Product
            </button>


            <button
              className="btn-secondary"
              style={{ marginTop: 6 }}
              onClick={() => removeProduct(p.id)}
            >
              Remove
            </button>


          </div>

        </div>

      ))}

      {editProduct && (
        <div
          onClick={() => setEditProduct(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(20,24,22,0.55)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '5vh 16px', overflowY: 'auto', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, maxWidth: 720, width: '100%', position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', padding: 24 }}
          >
            <button
              type="button"
              onClick={() => setEditProduct(null)}
              aria-label="Close"
              style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#f3f3f3', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
            <AddProductPanel
              editProduct={editProduct}
              onSaved={() => { setEditProduct(null); load(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
