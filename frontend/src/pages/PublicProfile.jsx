import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import MarketplaceHeader from '../components/MarketplaceHeader';
import Icon from '../components/icons/icon';
import ProfileActionsMenu from '../components/ProfileActionsMenu';
import { subscribeToProfilePhotoUpdates } from '../utils/profileSync';
import { isAuthenticated } from '../utils/auth';

const ROLE_LABELS = {
  buyer: 'Buyer', seller: 'Seller', manufacturer: 'Manufacturer', supplier: 'Supplier',
  dropshipper: 'Dropshipper', delivery: 'Delivery Partner', farmer: 'Farmer',
  affiliate: 'Affiliate', live_host: 'Live Host', logistics_provider: 'Logistics Provider',
  admin: 'Admin'
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}

// Small badge list for every authorized role on this one identity — e.g.
// "Buyer · Manufacturer · Verified" instead of a single primary_role, since
// one account can hold several roles at once (see profileController.js
// getAuthorizedRoles). Verification is shown as its own badge, separate
// from the role itself, per the platform's verification-vs-reputation
// distinction — never a role a user can claim on their own.
function RoleBadges({ roles }) {
  if (!roles?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {roles.map((r) => (
        <span key={r.role} className="product-card-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {ROLE_LABELS[r.role] || r.role}
          {(r.verification?.level && r.verification.level !== 'unverified') || r.verification?.shopVerified ? (
            <Icon name="checkShield" size={12} />
          ) : null}
        </span>
      ))}
    </div>
  );
}

export default function PublicProfile() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const signedIn = isAuthenticated();

  useEffect(() => {
    setProfile(null);
    setNotFound(false);
    client.get(`/profile/${userId}`)
      .then(({ data }) => setProfile(data))
      .catch(() => setNotFound(true));
  }, [userId]);

  // If this person changes their own photo while I'm looking at their
  // profile (same tab), reflect it without a reload.
  useEffect(() => subscribeToProfilePhotoUpdates(userId, (patch) => {
    setProfile((prev) => prev && ({
      ...prev,
      user: {
        ...prev.user,
        ...(patch.avatar_url !== undefined && { avatarUrl: patch.avatar_url }),
        ...(patch.cover_image_url !== undefined && { coverImageUrl: patch.cover_image_url })
      }
    }));
  }), [userId]);

  if (notFound) return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body"><div className="empty-state">This profile could not be found.</div></div>
    </div>
  );
  if (!profile) return <div className="empty-state">Loading profile…</div>;

  const { user, shop, publicRoleInfo, authorizedRoles, followerCount, followingCount, showActivity, isPrivate } = profile;

  return (
    <div>
      <MarketplaceHeader />
      <div style={{
        height: 140, background: user.coverImageUrl ? `url(${user.coverImageUrl}) center/cover` : 'linear-gradient(160deg, var(--forest), var(--forest-dark))'
      }} />
      <div className="dash-body" style={{ maxWidth: 800, paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: -40, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: '#fff', border: '4px solid #fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--forest)'
          }}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(user.fullName)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.3rem' }}>{user.fullName}</h1>
              {user.isVerified && <Icon name="checkShield" size={17} color="var(--forest)" />}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#5B6760' }}>
              @{user.username} · Member since {new Date(user.memberSince).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
              {(user.locationCity || user.locationCountry) && ` · ${[user.locationCity, user.locationCountry].filter(Boolean).join(', ')}`}
            </div>
            <RoleBadges roles={authorizedRoles} />
          </div>

          {!user.isOwner && (
            <ProfileActionsMenu
              userId={user.id}
              isFollowing={user.isFollowing}
              isSignedIn={signedIn}
              onFollowChange={(nowFollowing) => setProfile((prev) => prev && ({
                ...prev,
                user: { ...prev.user, isFollowing: nowFollowing },
                followerCount: prev.followerCount != null ? prev.followerCount + (nowFollowing ? 1 : -1) : prev.followerCount
              }))}
            />
          )}
          {user.isOwner && (
            <Link to="/profile" className="btn-secondary">Edit your profile</Link>
          )}
        </div>

        {followerCount != null && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: '0.9rem' }}>
            <Link to={`/u/${userId}/followers`} style={{ color: 'inherit' }}><strong>{followerCount}</strong> followers</Link>
            <Link to={`/u/${userId}/following`} style={{ color: 'inherit' }}><strong>{followingCount}</strong> following</Link>
          </div>
        )}

        {isPrivate ? (
          <div className="card-surface" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <Icon name="lock" size={28} color="#5B6760" />
            <p style={{ color: '#5B6760', marginTop: 8 }}>This account is private. Follow to see their activity, shop, and reviews.</p>
          </div>
        ) : (
          <>
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
              <div className="card-surface" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <strong>{shop.name}</strong>
                  <Link to={`/s/${shop.slug}`} className="btn-link">Visit store →</Link>
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
                  <div><div className="product-card-meta">Rating</div><div style={{ fontWeight: 700 }}>{shop.rating.toFixed(1)} ★ ({shop.reviewCount})</div></div>
                  <div><div className="product-card-meta">Shop followers</div><div style={{ fontWeight: 700 }}>{shop.followerCount}</div></div>
                  <div><div className="product-card-meta">Products</div><div style={{ fontWeight: 700 }}>{shop.productsCount}</div></div>
                </div>
              </div>
            )}

            {!showActivity && (
              <div className="card-surface" style={{ textAlign: 'center', padding: '20px 16px', color: '#5B6760' }}>
                This user has chosen to keep their activity private.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
