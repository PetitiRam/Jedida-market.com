import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import MarketplaceHeader from '../components/MarketplaceHeader';
import Icon from '../components/icons/icon';

const ROLE_LABELS = {
  buyer: 'Buyer', seller: 'Seller', manufacturer: 'Manufacturer', supplier: 'Supplier',
  dropshipper: 'Dropshipper', delivery: 'Delivery Partner'
};

const DASHBOARD_LINKS = {
  seller: { to: '/seller', label: 'Go to Seller Dashboard' },
  manufacturer: { to: '/seller', label: 'Go to Business Dashboard' },
  supplier: { to: '/seller', label: 'Go to Business Dashboard' },
  dropshipper: { to: '/seller', label: 'Go to Dropship Dashboard' },
  delivery: { to: '/driver', label: 'Go to Driver Dashboard' }
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}

function StatCard({ label, value }) {
  return (
    <div>
      <div className="product-card-meta">{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function EditProfileForm({ user, onDone, onCancel }) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [coverImageUrl, setCoverImageUrl] = useState(user.cover_image_url || '');
  const [bio, setBio] = useState(user.bio || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await client.patch('/profile/me', { fullName, avatarUrl, coverImageUrl, bio });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 20 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-group"><label>Full name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
      <div className="field-group"><label>Avatar URL</label><input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" /></div>
      <div className="field-group"><label>Cover image URL</label><input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://…" /></div>
      <div className="field-group">
        <label>Bio ({bio.length}/500)</label>
        <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 500))} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}

function ShopStatsCard({ shop }) {
  if (!shop) return null;
  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <strong>{shop.name}</strong>
        <Link to={`/s/${shop.slug}`} className="btn-link">View storefront →</Link>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <StatCard label="Rating" value={`${shop.rating.toFixed(1)} ★ (${shop.reviewCount})`} />
        <StatCard label="Followers" value={shop.followerCount} />
        <StatCard label="Active products" value={shop.productsCount} />
      </div>
    </div>
  );
}

function BusinessStatsCard({ bp, role }) {
  if (!bp) return null;
  const showDropship = role === 'dropshipper';
  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <strong>{bp.company_name || 'Business profile'}</strong>
        {bp.verification_level && bp.verification_level !== 'unverified' && (
          <span className="product-card-badge" style={{ textTransform: 'capitalize' }}>{bp.verification_level}</span>
        )}
      </div>
      {!showDropship && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.85rem', color: '#5B6760' }}>
          {bp.factory_address && <span>Factory: {bp.factory_address}</span>}
          {bp.warehouse_address && <span>Warehouse: {bp.warehouse_address}</span>}
          {bp.stock_availability && <span>Stock: {bp.stock_availability.replace(/_/g, ' ')}</span>}
        </div>
      )}
      {showDropship && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <StatCard label="Performance score" value={`${Number(bp.dropship_performance_score).toFixed(1)}/100`} />
          <StatCard label="Completed orders" value={`${bp.dropship_completed_orders}/${bp.dropship_total_orders}`} />
          <StatCard label="Commission earned" value={Number(bp.dropship_total_commission_earned).toLocaleString()} />
        </div>
      )}
    </div>
  );
}

function DriverStatsCard({ driver }) {
  if (!driver) return null;
  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <strong style={{ display: 'block', marginBottom: 10 }}>Driver profile</strong>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <StatCard label="Rating" value={`${Number(driver.rating).toFixed(1)} ★`} />
        <StatCard label="Completed deliveries" value={driver.completedDeliveries} />
        <StatCard label="Vehicle" value={driver.vehicle_type || '—'} />
        <StatCard label="Status" value={driver.is_available ? 'Available' : 'Offline'} />
      </div>
    </div>
  );
}

function BuyerStatsCard({ stats }) {
  if (!stats) return null;
  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <strong style={{ display: 'block', marginBottom: 10 }}>Your activity</strong>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <StatCard label="Orders placed" value={stats.ordersPlaced} />
        <StatCard label="Orders completed" value={stats.ordersCompleted} />
        <StatCard label="Reviews written" value={stats.reviewsWritten} />
      </div>
    </div>
  );
}

const UPGRADE_OPTIONS = [
  { to: '/seller/upgrade', label: 'Become a Seller', icon: 'box' },
  { to: '/manufacturer/upgrade', label: 'Become a Manufacturer', icon: 'factory' },
  { to: '/supplier/upgrade', label: 'Become a Supplier', icon: 'building' },
  { to: '/dropshipper/upgrade', label: 'Become a Dropshipper', icon: 'share' },
  { to: '/delivery/upgrade', label: 'Become a Delivery Partner', icon: 'truck' }
];

export default function MyProfile() {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/profile/me');
      setProfile(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (loading || !profile) return <div className="empty-state">Loading your profile…</div>;

  const { user, wallet, shop, roleProfile } = profile;
  const dash = DASHBOARD_LINKS[user.primary_role];

  return (
    <div>
      <MarketplaceHeader />
      <div style={{
        height: 160, background: user.cover_image_url ? `url(${user.cover_image_url}) center/cover` : 'linear-gradient(160deg, var(--forest), var(--forest-dark))'
      }} />
      <div className="dash-body" style={{ maxWidth: 900, paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: -44, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%', background: '#fff', border: '4px solid #fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 700, color: 'var(--forest)'
          }}>
            {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(user.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.4rem' }}>{user.full_name}</h1>
              {user.is_verified && <Icon name="checkShield" size={18} color="var(--forest)" />}
              <span className="product-card-badge">{ROLE_LABELS[user.primary_role] || user.primary_role}</span>
              {user.is_admin && <span className="product-card-badge">Admin{user.admin_role ? ` · ${user.admin_role.replace(/_/g, ' ')}` : ''}</span>}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#5B6760' }}>
              @{user.username} · Member since {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
              {(user.location_city || user.location_country) && ` · ${[user.location_city, user.location_country].filter(Boolean).join(', ')}`}
            </div>
          </div>
          {!editing && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/account/security" className="btn-secondary">Security settings</Link>
              <button className="btn-secondary" onClick={() => setEditing(true)}>Edit profile</button>
            </div>
          )}
        </div>

        {user.bio && !editing && <p style={{ color: '#5B6760', maxWidth: 640, marginBottom: 20 }}>{user.bio}</p>}
        {editing && <EditProfileForm user={user} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); load(); }} />}

        <div className="weave-divider" style={{ marginBottom: 20 }} />

        {wallet && (
          <div className="card-surface" style={{ marginBottom: 16 }}>
            <div className="product-card-meta">Wallet balance</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{wallet.currency} {Number(wallet.balance).toLocaleString()}</div>
          </div>
        )}

        {user.primary_role === 'buyer' && <BuyerStatsCard stats={roleProfile} />}
        {['manufacturer', 'supplier', 'dropshipper'].includes(user.primary_role) && <BusinessStatsCard bp={roleProfile} role={user.primary_role} />}
        {user.primary_role === 'delivery' && <DriverStatsCard driver={roleProfile} />}
        {['seller', 'manufacturer', 'supplier', 'dropshipper'].includes(user.primary_role) && <ShopStatsCard shop={shop} />}

        {dash && (
          <Link to={dash.to} className="btn-primary" style={{ display: 'inline-block', marginBottom: 20 }}>{dash.label}</Link>
        )}
        {user.is_admin && (
          <Link to="/admin" className="btn-primary" style={{ display: 'inline-block', marginBottom: 20, marginLeft: dash ? 8 : 0 }}>Go to Admin Panel</Link>
        )}

        {user.primary_role === 'buyer' && (
          <div className="card-surface" style={{ background: 'var(--cream-dim)' }}>
            <h3 style={{ marginBottom: 4 }}>Grow with Jedida</h3>
            <p className="product-card-meta" style={{ marginBottom: 14 }}>Your account is currently a Buyer account — upgrade to unlock a new way to earn.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {UPGRADE_OPTIONS.map((o) => (
                <Link key={o.to} to={o.to} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={o.icon} size={15} /> {o.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
