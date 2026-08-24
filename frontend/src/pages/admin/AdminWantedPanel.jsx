import { useEffect, useState } from 'react';
import * as adminWantedApi from '../../api/adminWantedApi';

const STATUS_OPTIONS = ['', 'submitted', 'matching', 'matched', 'quoted', 'closed', 'cancelled', 'removed_by_admin'];

function PostsTab() {
  const [posts, setPosts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [reasonDrafts, setReasonDrafts] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminWantedApi.adminListWantedPosts(statusFilter ? { status: statusFilter } : {});
      setPosts(data.posts || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [statusFilter]);

  const remove = async (id) => {
    await adminWantedApi.adminRemoveWantedPost(id, reasonDrafts[id] || undefined);
    load();
  };
  const restore = async (id) => {
    await adminWantedApi.adminRestoreWantedPost(id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {STATUS_OPTIONS.map((s) => (
          <button key={s || 'all'} className={statusFilter === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setStatusFilter(s)}>
            {s || 'all'}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state">Loading…</div>}
      {!loading && posts.length === 0 && <div className="empty-state">No Wanted posts match this filter.</div>}

      {posts.map((p) => (
        <div key={p.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{p.title}</div>
              <div className="product-card-meta">
                {p.buyer_name} ({p.buyer_email}) · {p.category} · {p.visibility}
                {' · '}{new Date(p.created_at).toLocaleDateString()}
              </div>
            </div>
            <span className="product-card-badge">{p.status}</span>
          </div>
          <p style={{ fontSize: '0.85rem', margin: '8px 0' }}>{p.description}</p>
          {p.status === 'removed_by_admin' && p.removed_reason && (
            <div className="alert alert-error">Removed: {p.removed_reason}</div>
          )}

          {p.status === 'removed_by_admin' ? (
            <button className="btn-primary" onClick={() => restore(p.id)}>Restore</button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                placeholder="Reason (optional)"
                value={reasonDrafts[p.id] || ''}
                onChange={(e) => setReasonDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                style={{ flex: 1, minWidth: 160 }}
              />
              <button className="btn-link" style={{ color: '#B3261E' }} onClick={() => remove(p.id)}>Remove</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SecurityEventsTab() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminWantedApi.adminListWantedSecurityEvents();
      setEvents(data.events || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Blocked contact-sharing / off-platform attempts across Wanted quotes, replies and negotiation messages
        (brief §3/§6/§7/§29) — the content itself is never stored, only the fact that it was blocked.
      </p>
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && events.length === 0 && <div className="empty-state">No flagged messages.</div>}
      {events.map((e) => (
        <div key={e.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span className="product-card-badge">{e.action}</span>{' '}
              <strong>{e.actor_name || 'Unknown user'}</strong> on "{e.wanted_request_title || 'deleted post'}"
            </div>
            <div className="product-card-meta">{new Date(e.created_at).toLocaleString()}</div>
          </div>
          {e.metadata?.violations && (
            <div className="product-card-meta" style={{ marginTop: 4 }}>
              Detected: {Array.isArray(e.metadata.violations) ? e.metadata.violations.join(', ') : String(e.metadata.violations)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AdminWantedPanel() {
  const [tab, setTab] = useState('posts');

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #E4E9E6' }}>
        <button className={tab === 'posts' ? 'btn-primary' : 'btn-link'} onClick={() => setTab('posts')}>Wanted Posts</button>
        <button className={tab === 'security' ? 'btn-primary' : 'btn-link'} onClick={() => setTab('security')}>Flagged Messages</button>
      </div>
      {tab === 'posts' && <PostsTab />}
      {tab === 'security' && <SecurityEventsTab />}
    </div>
  );
}
