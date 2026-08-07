import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DropdownShell from './DropdownShell';
import RippleIconButton from './RippleIconButton';
import Icon from '../icons/icon';
import * as commerceApi from '../../api/commerceApi';
import client from '../../api/client';

export default function WishlistMenu({ onCartChange, showLabel = false }) {
  const [products, setProducts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    client.get('/wishlist/mine').then(({ data }) => {
      setProducts(data.products || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  };

  useEffect(() => { load(); }, []);

  const remove = async (productId) => {
    await commerceApi.toggleWishlist(productId).catch(() => {});
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const addToCart = async (productId, close) => {
    await commerceApi.addToCart(productId, 1).catch(() => {});
    onCartChange?.();
    close();
    navigate('/cart');
  };

  return (
    <DropdownShell
      onOpen={load}
      width={340}
      trigger={({ open, toggle }) => (
        <RippleIconButton
          label="Wishlist"
          active={open}
          onClick={toggle}
          showLabel={showLabel}
          badge={products.length > 0 && <span className="jd-badge">{products.length > 9 ? '9+' : products.length}</span>}
        >
          <Icon name="heart" size={19} />
        </RippleIconButton>
      )}
    >
      {({ close }) => (
        <>
          <div className="jd-menu-header"><span>Wishlist</span></div>
          <div className="jd-menu-list">
            {!loaded && <div className="jd-menu-empty">Loading…</div>}
            {loaded && products.length === 0 && (
              <div className="jd-menu-empty">Nothing saved yet — tap the heart on a product to add it here.</div>
            )}
            {products.slice(0, 6).map((p) => {
              const image = (Array.isArray(p.images) && p.images[0]) || p.image_url || '/placeholder.png';
              return (
                <div key={p.id} className="jd-wish-row">
                  <button
                    type="button"
                    className="jd-wish-row-main"
                    onClick={() => { close(); navigate(`/product/${p.id}`); }}
                  >
                    <img src={image} alt="" className="jd-wish-thumb" loading="lazy" />
                    <span className="jd-wish-info">
                      <span className="jd-menu-row-title">{p.title}</span>
                      <span className="jd-wish-price">{p.currency || 'UGX'} {Number(p.price).toLocaleString()}</span>
                    </span>
                  </button>
                  <div className="jd-wish-actions">
                    <button type="button" className="jd-wish-action" onClick={() => addToCart(p.id, close)} aria-label="Add to cart">
                      <Icon name="cart" size={15} />
                    </button>
                    <button type="button" className="jd-wish-action jd-wish-action-remove" onClick={() => remove(p.id)} aria-label="Remove from wishlist">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </DropdownShell>
  );
}
