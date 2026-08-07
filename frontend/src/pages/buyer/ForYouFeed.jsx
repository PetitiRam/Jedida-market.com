import { useEffect, useState } from 'react';
import client from '../../api/client';
import FeedPostCard from '../../components/feed/FeedPostCard';

export default function ForYouFeed() {
  const [posts, setPosts] = useState(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    client.get('/shop-feed/for-you').then(({ data }) => {
      setPosts(data.posts);
      setFallback(data.fallback);
    }).catch(() => setPosts([]));
  }, []);

  return (
    <div className="page-container" style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <h2>For You</h2>
      {fallback && (
        <div className="alert" style={{ marginBottom: 16 }}>
          You're not following any Verified Shops yet — here's what's new across the marketplace.
        </div>
      )}
      {posts === null && <div className="empty-state">Loading your feed…</div>}
      {posts?.length === 0 && <div className="empty-state">Nothing here yet — follow some Verified Shops to see their posts.</div>}
      {posts?.map((p) => <FeedPostCard key={p.id} post={p} />)}
    </div>
  );
}
