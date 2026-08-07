import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import FeedPostCard from '../feed/FeedPostCard';

export default function DiscoveryFeedSection() {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    client.get('/shop-feed/discovery', { params: { pageSize: 6 } })
      .then(({ data }) => setPosts(Array.isArray(data?.posts) ? data.posts : []))
      .catch(() => setPosts([]));
  }, []);

  if (posts !== null && posts.length === 0) return null;

  return (
    <div className="home-section">
      <div className="home-section-head">
        <h2>📣 From Verified Shops</h2>
        <Link to="/feed" className="btn-secondary">See more</Link>
      </div>
      {posts === null && <div className="empty-state">Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {posts?.map((p) => <FeedPostCard key={p.id} post={p} />)}
      </div>
    </div>
  );
}
