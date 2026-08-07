import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import * as commerceApi from '../api/commerceApi';
import Icon from './icons/icon';
import QuickViewModal from './product/QuickViewModal';

export default function ProductCard({ product, onPress, compact = false }) {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [shareState, setShareState] = useState('idle'); // idle | copied
  const [cartState, setCartState] = useState('idle'); // idle | adding | added

  useEffect(() => {
    if (!product?.id) return;
    commerceApi.getWishlistStatus(product.id)
      .then(({ data }) => setLiked(!!data.wishlisted))
      .catch(() => {}); // not signed in / not reachable — leave default
  }, [product?.id]);

  if (!product) return null;

  const getImage = () => {
    if (Array.isArray(product.images) && product.images.length) {
      const first = product.images[0];
      if (typeof first === 'string') return first;
      if (first?.url) return first.url;
    }
    return product.image_url || product.image || '/placeholder.png';
  };

  const specs = (typeof product.specs === 'object' && product.specs) || {};
  const shipping = (typeof product.shipping_options === 'object' && !Array.isArray(product.shipping_options) && product.shipping_options) || {};
  const price = Number(product.price || 0);
  const oldPrice = Number(product.original_price || 0);
  const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : null;
  const stock = Number.isFinite(Number(product.quantity_available)) ? Number(product.quantity_available) : null;
  const lowStock = stock !== null && stock > 0 && stock <= 5;
  const outOfStock = stock === 0;
  const isShopVerified = Boolean(product.shop_is_verified);
  const rating = specs.rating ? Number(specs.rating) : null;
  const deliveryEstimate = shipping.deliveryTime || null;
  const isNew = product.created_at
    ? (Date.now() - new Date(product.created_at).getTime()) < 14 * 24 * 60 * 60 * 1000
    : false;
  const distanceKm = product.distance_km !== undefined && product.distance_km !== null
    ? Number(product.distance_km)
    : null;
  const distanceLabel = distanceKm !== null
    ? (distanceKm < 1 ? 'Less than 1 km away' : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km away`)
    : null;

  const toggleWishlist = async (e) => {
    e.preventDefault();
    const next = !liked;
    setLiked(next); // optimistic
    try {
      const { data } = await commerceApi.toggleWishlist(product.id);
      setLiked(!!data.wishlisted);
    } catch {
      setLiked(!next); // revert on failure (e.g. not signed in)
    }
  };

  const handleShare = async (e) => {
    e.preventDefault();
    const url = `${window.location.origin}/product/${product.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.title, url });
      } catch {
        // user cancelled the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 1800);
    } catch {
      // clipboard unavailable — silently ignore rather than break the card
    }
  };

  const openQuickView = (e) => {
    e.preventDefault();
    setQuickViewOpen(true);
  };

  const handleAddToCart = async (e) => {
    e.preventDefault();
    if (outOfStock || cartState === 'adding') return;
    setCartState('adding');
    try {
      await commerceApi.addToCart(product.id, 1);
      setCartState('added');
      setTimeout(() => setCartState('idle'), 1800);
    } catch {
      setCartState('idle');
    }
  };

  return (
    <>
      <Link
        to={`/product/${product.id}`}
        onClick={onPress}
        className={`product-card-v2${compact ? ' is-compact' : ''}`}
      >
        {/* IMAGE */}
        <div className="product-card-v2-image">
          <img
            src={getImage()}
            alt={product.title}
            loading="lazy"
            onError={(e) => { e.currentTarget.src = '/placeholder.png'; }}
          />

          <div className="pc-badge-row">
            {distanceLabel && <span className="pc-badge pc-badge-nearby"><Icon name="mapPin" size={10} /> {distanceLabel}</span>}
            {isNew && <span className="pc-badge pc-badge-new">New</span>}
            {product.is_trending && <span className="pc-badge pc-badge-trending">Trending</span>}
            {isShopVerified && <span className="pc-badge pc-badge-verified"><Icon name="checkShield" size={10} /> Verified</span>}
            {discount && <span className="pc-badge pc-badge-discount">Sale -{discount}%</span>}
          </div>

          <div className="pc-quick-actions">
            <button type="button" onClick={toggleWishlist} aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'} className="pc-icon-btn">
              <Icon name={liked ? 'heartFilled' : 'heart'} size={16} fill={liked ? 'currentColor' : 'none'} />
            </button>
            <button type="button" onClick={handleShare} aria-label="Share product" title={shareState === 'copied' ? 'Link copied!' : 'Share'} className="pc-icon-btn">
              <Icon name="share" size={15} />
            </button>
            <button type="button" onClick={openQuickView} aria-label="Quick view" title="Quick view" className="pc-icon-btn">
              <Icon name="eye" size={16} />
            </button>
          </div>

          {outOfStock && <span className="pc-stock-pill">Out of stock</span>}
          {lowStock && <span className="pc-stock-pill low">Only {stock} left</span>}
        </div>

        {/* DETAILS */}
        <div className="product-card-v2-body">
          <h3 className="product-card-v2-title">{product.title || 'Unnamed Product'}</h3>

          {product.shop_name && (
            <div className="product-card-v2-seller">
              {product.shop_name}
              {isShopVerified && <Icon name="checkShield" size={12} />}
            </div>
          )}

          {(rating || product.reviews_count > 0) && (
            <div className="product-card-v2-rating">
              {rating && <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="starFilled" size={13} /> {rating.toFixed(1)}</span>}
              {product.reviews_count > 0 && <span>({product.reviews_count})</span>}
            </div>
          )}

          <div className="product-card-v2-price-row">
            <span className="product-card-v2-price">{product.currency || 'UGX'} {price.toLocaleString()}</span>
            {oldPrice > price && <span className="product-card-v2-price-old">{product.currency || 'UGX'} {oldPrice.toLocaleString()}</span>}
          </div>

          {(deliveryEstimate || product.location_city) && (
            <div className="product-card-v2-meta-row">
              {product.location_city && <span>{product.location_city}{product.location_country ? `, ${product.location_country}` : ''}</span>}
              {deliveryEstimate && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="truck" size={13} /> {deliveryEstimate}</span>}
            </div>
          )}

          <div className="product-card-v2-actions">
            {!compact && (
              <button
                type="button"
                className="pc-btn-view"
                onClick={(e) => { e.preventDefault(); navigate(`/product/${product.id}`); }}
              >
                View Details
              </button>
            )}
            <button
              type="button"
              className="pc-btn-cart"
              onClick={handleAddToCart}
              disabled={outOfStock || cartState === 'adding'}
            >
              <Icon name="cart" size={15} />
              {outOfStock ? 'Out of stock' : cartState === 'added' ? 'Added' : cartState === 'adding' ? 'Adding…' : 'Add to cart'}
            </button>
          </div>
        </div>
      </Link>

      {quickViewOpen && (
        <QuickViewModal product={product} onClose={() => setQuickViewOpen(false)} />
      )}
    </>
  );
}
