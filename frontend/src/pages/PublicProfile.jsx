import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import MarketplaceHeader from '../components/MarketplaceHeader';
import Icon from '../components/icons/icon';

const ROLE_LABELS = {
  buyer: 'Buyer', seller: 'Seller', manufacturer: 'Manufacturer', supplier: 'Supplier',
  dropshipper: 'Dropshipper', delivery: 'Delivery Partner'
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}

export default function PublicProfile() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    client.get(`/profile/${userId}`)
      .then(({ data }) => setProfile(data))
      .catch(() => setNotFound(true));
  }, [userId]);

  if (notFound) return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body"><div className="empty-state">This profile could not be found.</div></div>
    </div>
  );
  if (!profile) return <div className="empty-state">Loading profile…</div>;

  const { user, shop, publicRoleInfo } = profile;

  return (
    <div>
      <MarketplaceHeader />
      <div style={{
        height: 140, background: user.cover_image_url ? `url(${user.cover_image_url}) center/cover` : 'linear-gradient(160deg, var(--forest), var(--forest-dark))'
      }} />
      <div className="dash-body" style={{ maxWidth: 800, paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: -40, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: '#fff', border: '4px solid #fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--forest)'
          }}>
            {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(user.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.3rem' }}>{user.full_name}</h1>
              {user.is_verified && <Icon name="checkShield" size={17} color="var(--forest)" />}
              <span className="product-card-badge">{ROLE_LABELS[user.primary_role] || user.primary_role}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#5B6760' }}>
              @{user.username} · Member since {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
              {(user.location_city || user.location_country) && ` · ${[user.location_city, user.location_country].filter(Boolean).join(', ')}`}
            </div>
          </div>
        </div>

        {user.bio && <p style={{ color: '#5B6760', maxWidth: 600, marginBottom: 20 }}>{user.bio}</p>}

        {publicRoleInfo?.companyName && (
          <div className="card-surface" style={{ marginBottom: 16 }}>
            <strong>{publicRoleInfo.companyName}</strong>
            {publicRoleInfo.verificationLevel && publicRoleInfo.verificationLevel !== 'unverified' && (
              <span className="product-card-badge" style={{ marginLeft: 8, textTransform: 'capitalize' }}>{publicRoleInfo.verificationLevel}</span>
            )}
          </div>
        )}
        {publicRoleInfo?.rating != null && (
          <div className="card-surface" style={{ marginBottom: 16 }}>
            <div className="product-card-meta">Delivery rating</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{Number(publicRoleInfo.rating).toFixed(1)} ★ ({publicRoleInfo.completedDeliveries} deliveries)</div>
          </div>
        )}

        {shop && (
          <div className="card-surface">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <strong>{shop.name}</strong>
              <Link to={`/s/${shop.slug}`} className="btn-link">Visit store →</Link>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
              <div><div className="product-card-meta">Rating</div><div style={{ fontWeight: 700 }}>{shop.rating.toFixed(1)} ★ ({shop.reviewCount})</div></div>
              <div><div className="product-card-meta">Followers</div><div style={{ fontWeight: 700 }}>{shop.followerCount}</div></div>
              <div><div className="product-card-meta">Products</div><div style={{ fontWeight: 700 }}>{shop.productsCount}</div></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
