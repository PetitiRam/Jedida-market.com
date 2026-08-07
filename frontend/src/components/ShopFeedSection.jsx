import { useEffect, useState } from 'react';
import client from '../api/client';
import FeedPostCard from './feed/FeedPostCard';

export default function ShopFeedSection({ shopId, isVerified }) {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    if (!isVerified) return;
    client.get(`/shop-feed/shop/${shopId}`).then(({ data }) => setPosts(data.posts)).catch(() => setPosts([]));
  }, [shopId, isVerified]);

  if (!isVerified) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ marginBottom: 12 }}>📣 Shop Feed</h3>
      {posts === null && <div className="empty-state">Loading feed…</div>}
      {posts?.length === 0 && <div className="empty-state">This shop hasn't posted yet.</div>}
      {posts?.map((p) => <FeedPostCard key={p.id} post={p} showShopHeader={false} />)}
    </div>
  );
}
