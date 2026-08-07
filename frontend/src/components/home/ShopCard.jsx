import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../icons/icon';
import * as commerceApi from '../../api/commerceApi';

export default function ShopCard({ shop }) {
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    if (!shop?.id) return;
    commerceApi.getShopFollowInfo(shop.id)
      .then(({ data }) => setFollowing(!!data.following))
      .catch(() => {});
  }, [shop?.id]);

  const toggleFollow = async (e) => {
    e.preventDefault();
    const next = !following;
    setFollowing(next);
    try {
      const { data } = await commerceApi.toggleFollow(shop.id);
      setFollowing(!!data.following);
    } catch {
      setFollowing(!next);
    }
  };

  const rating = Number(shop.rating || 0);
  const reviewCount = Number(shop.review_count || 0);
  const followerCount = Number(shop.follower_count || 0);
  const isVerified = Boolean(shop.is_verified);

  return (
    <Link to={`/s/${shop.slug}`} className="shop-card-v2">
      <div className="shop-card-v2-banner" style={shop.banner_url ? { backgroundImage: `url(${shop.banner_url})` } : undefined}>
        {shop.logo_url && <img className="shop-card-v2-logo" src={shop.logo_url} alt={shop.name} loading="lazy" />}
      </div>
      <div className="shop-card-v2-body">
        <div className="shop-card-v2-name-row">
          <span className="shop-card-v2-name">{shop.name}</span>
          {isVerified && <Icon name="checkShield" size={16} />}
        </div>
        <div className="shop-card-v2-meta">
          {rating > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Icon name="starFilled" size={13} /> {rating.toFixed(1)} {reviewCount > 0 && `(${reviewCount})`}
            </span>
          )}
          {followerCount > 0 && <span>{followerCount} followers</span>}
          {shop.product_count > 0 && <span>{shop.product_count} products</span>}
        </div>
        <button type="button" className={`shop-follow-btn ${following ? 'following' : ''}`} onClick={toggleFollow}>
          {following ? 'Following' : 'Follow shop'}
        </button>
      </div>
    </Link>
  );
}
