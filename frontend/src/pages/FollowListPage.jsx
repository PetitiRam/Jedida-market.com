import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import client from '../api/client';
import MarketplaceHeader from '../components/MarketplaceHeader';
import Icon from '../components/icons/icon';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}

// One page for both directions of the follow graph — which list it shows
// is driven entirely by the route (/u/:userId/followers vs /following),
// since both hit the same shape of endpoint and render identically.
export default function FollowListPage() {
  const { userId } = useParams();
  const location = useLocation();
  const mode = location.pathname.endsWith('/following') ? 'following' : 'followers';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    client.get(`/profile/${userId}/${mode}`)
      .then(({ data }) => setUsers(data.users || []))
      .catch(() => setError('Could not load this list.'))
      .finally(() => setLoading(false));
  }, [userId, mode]);

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Link to={`/u/${userId}`} className="btn-link" style={{ display: 'flex', alignItems: 'center' }}>
            <Icon name="chevronLeft" size={18} />
          </Link>
          <h1 style={{ fontSize: '1.2rem', textTransform: 'capitalize' }}>{mode}</h1>
        </div>

        {loading && <div className="empty-state">Loading…</div>}
        {!loading && error && <div className="alert alert-error">{error}</div>}
        {!loading && !error && users.length === 0 && (
          <div className="empty-state">{mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</div>
        )}

        {!loading && users.map((u) => (
          <Link
            key={u.id}
            to={`/u/${u.id}`}
            className="card-surface"
            style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, color: 'inherit', textDecoration: 'none' }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#EEF3EF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--forest)'
            }}>
              {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(u.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong>{u.full_name}</strong>
                {u.is_verified && <Icon name="checkShield" size={13} color="var(--forest)" />}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>@{u.username}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
