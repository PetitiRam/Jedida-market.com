import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as commerceApi from '../../api/commerceApi';

/**
 * Following tab (spec: follow/unfollow shops, users, and Live hosts, plus
 * followers/following/privacy/blocking/reporting).
 *
 * Backed by GET /shops/following/mine — lists shops the buyer follows,
 * reusing the same follow/unfollow toggle already used from shop pages
 * (commerceApi.toggleFollow) so there's still only one follow system.
 *
 * "Users" and "Live hosts" following isn't in scope here: the platform
 * only has a shop_follows table today (see schema_phase17), no
 * user_follows or host_follows table, so there's nothing to list for
 * those yet — this panel sticks to what's real.
 */
export default function BuyerFollowingPanel() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unfollowingId, setUnfollowingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await commerceApi.listMyFollowedShops();
      setShops(data.shops || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the shops you follow.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const unfollow = async (shopId) => {
    setUnfollowingId(shopId);
    try {
      await commerceApi.toggleFollow(shopId);
      setShops((prev) => prev.filter((s) => s.id !== shopId));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not unfollow this shop.');
    } finally {
      setUnfollowingId(null);
    }
  };

  if (loading) return <div className="empty-state">Loading shops you follow…</div>;

  return (
    <div>
      <h2>Following</h2>
      {error && <div className="alert alert-error">{error}</div>}

      {shops.length === 0 ? (
        <div className="empty-state">
          <p>You aren't following any shops yet.</p>
          <Link to="/marketplace" className="btn-secondary">Browse shops to follow</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shops.map((s) => (
            <div
              className="card-surface"
              key={s.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {s.logo_url && (
                  <img src={s.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                )}
                <div>
                  <Link to={`/s/${s.slug}`} style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit' }}>
                    {s.name}{s.is_verified && ' ✔'}
                  </Link>
                  <div className="product-card-meta">
                    {Number(s.follower_count).toLocaleString()} followers
                    {Number(s.review_count) > 0 && ` · ${Number(s.rating).toFixed(1)}★ (${s.review_count})`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-link"
                disabled={unfollowingId === s.id}
                onClick={() => unfollow(s.id)}
              >
                {unfollowingId === s.id ? 'Unfollowing…' : 'Unfollow'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
