import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as commerceApi from '../../api/commerceApi';
import Icon from '../icons/icon';

export default function SupplierCard({ product, onContact, onReport }) {
  const specs = product.specs || {};
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    if (!product.shop_id) return;
    commerceApi.getShopFollowInfo(product.shop_id).then(({ data }) => {
      setFollowing(data.following);
      setFollowerCount(data.followerCount);
    });
  }, [product.shop_id]);

  const toggleFollow = async () => {
    const { data } = await commerceApi.toggleFollow(product.shop_id);
    setFollowing(data.following);
    setFollowerCount((c) => c + (data.following ? 1 : -1));
  };

  return (
    <div className="card-surface">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {product.shop_logo ? (
          <img src={product.shop_logo} alt={product.shop_name} loading="lazy" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--cream-dim)' }} />
        )}
        <div>
          <strong>{product.shop_name}</strong>
          {product.shop_is_verified && (
            <div className="product-card-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="checkShield" size={12} /> Verified Shop
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem', color: '#5B6760', marginBottom: 14 }}>
        <Row label="Business type" value={specs.business_type} />
        <Row label="Manufacturer/Distributor" value={specs.supplier_type} />
        <Row label="Location" value={[product.location_city, product.location_country].filter(Boolean).join(', ')} />
        <Row label="Years on JEDIDA" value={specs.years_on_marketplace} />
        <Row label="Response rate" value={specs.response_rate ? `${specs.response_rate}%` : null} />
        <Row label="Avg. response time" value={specs.avg_response_time} />
        <Row label="Products listed" value={specs.products_listed_count} />
        <Row label="Completed orders" value={specs.completed_orders_count} />
        <Row label="Followers" value={followerCount} />
        <Row label="Store rating" value={specs.store_rating ? `${specs.store_rating} / 5` : null} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link to={`/s/${product.shop_slug}`}><button className="btn-secondary" style={{ width: '100%' }}>Visit Store</button></Link>
        <button className="btn-secondary" onClick={toggleFollow} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="users" size={16} filled={following} color={following ? 'var(--forest)' : 'currentColor'} />
          {following ? 'Following' : 'Follow Store'}
        </button>
        <button className="btn-primary" onClick={onContact} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="message" size={16} color="var(--cream)" /> Contact Marketplace
        </button>
        <button className="btn-link" onClick={onReport} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="flag" size={14} /> Report Listing
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <strong style={{ color: 'var(--ink)' }}>{value}</strong>
    </div>
  );
}
