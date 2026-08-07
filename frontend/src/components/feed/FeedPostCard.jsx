import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import Icon from '../icons/icon';

const TYPE_LABELS = {
  product_update: 'Product Update', new_arrival: '🆕 New Arrival', promotion: '🏷️ Promotion',
  restock: '📦 Restocked', behind_the_scenes: 'Behind the Scenes', business_story: 'Our Story',
  testimonial: '⭐ Customer Story', limited_time_offer: '⏰ Limited-Time Offer', general: null
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function FeedPostCard({ post, onChanged, showShopHeader = true }) {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(post.viewer_liked);
  const [saved, setSaved] = useState(post.viewer_saved);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [saveCount, setSaveCount] = useState(post.save_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentText, setCommentText] = useState('');

  const toggleLike = async () => {
    try {
      if (liked) { await client.delete(`/shop-feed/posts/${post.id}/like`); setLikeCount((c) => c - 1); }
      else { await client.post(`/shop-feed/posts/${post.id}/like`); setLikeCount((c) => c + 1); }
      setLiked(!liked);
    } catch { /* not logged in etc. — silently ignore, button just won't toggle */ }
  };

  const toggleSave = async () => {
    try {
      if (saved) { await client.delete(`/shop-feed/posts/${post.id}/save`); setSaveCount((c) => c - 1); }
      else { await client.post(`/shop-feed/posts/${post.id}/save`); setSaveCount((c) => c + 1); }
      setSaved(!saved);
    } catch { /* ignore */ }
  };

  const share = async () => {
    try {
      await client.post(`/shop-feed/posts/${post.id}/share`);
      if (navigator.share) {
        await navigator.share({ title: post.shop_name, text: post.caption, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(`${window.location.origin}/shop/${post.shop_slug}?post=${post.id}`);
      }
    } catch { /* ignore share cancel errors */ }
    onChanged?.();
  };

  const loadComments = async () => {
    setShowComments((v) => !v);
    if (!comments) {
      const { data } = await client.get(`/shop-feed/posts/${post.id}/comments`);
      setComments(data.comments);
    }
  };

  const postComment = async () => {
    if (!commentText.trim()) return;
    const { data } = await client.post(`/shop-feed/posts/${post.id}/comments`, { commentText });
    setComments((c) => [...(c || []), data.comment]);
    setCommentText('');
  };

  const media = Array.isArray(post.media) ? post.media : [];
  const typeLabel = TYPE_LABELS[post.post_type];
  const isOfferExpired = post.offer_ends_at && new Date(post.offer_ends_at) < new Date();

  return (
    <div className="card-surface" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      {showShopHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
             onClick={() => navigate(`/shop/${post.shop_slug}`)}>
          {post.shop_logo && <img src={post.shop_logo} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />}
          <div>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9rem' }}>
              {post.shop_name}
              {post.shop_is_verified && <Icon name="checkShield" size={13} color="var(--forest)" />}
            </strong>
            <div className="product-card-meta">{typeLabel && `${typeLabel} · `}{timeAgo(post.created_at)}</div>
          </div>
        </div>
      )}

      {media.length > 0 && (
        <div style={{ position: 'relative', background: '#000' }}>
          {media[0].media_type === 'video' ? (
            <video src={media[0].url} controls style={{ width: '100%', maxHeight: 420, display: 'block' }} />
          ) : (
            <img src={media[0].url} alt="" style={{ width: '100%', maxHeight: 420, objectFit: 'cover', display: 'block' }} />
          )}
          {post.discount_percent && (
            <div className="product-card-badge" style={{ position: 'absolute', top: 10, left: 10, background: '#dc2626', color: '#fff' }}>
              -{post.discount_percent}%
            </div>
          )}
          {post.post_type === 'limited_time_offer' && post.offer_ends_at && (
            <div className="product-card-badge" style={{ position: 'absolute', top: 10, right: 10, background: isOfferExpired ? '#6b7280' : '#d97706', color: '#fff' }}>
              {isOfferExpired ? 'Offer ended' : `Ends ${new Date(post.offer_ends_at).toLocaleDateString()}`}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '12px 14px' }}>
        {post.caption && <p style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{post.caption}</p>}

        {post.product_id && (
          <div className="field-row" style={{ alignItems: 'center', background: 'var(--cream-dim)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
            {post.product_images?.[0] && <img src={post.product_images[0]} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{post.product_title}</div>
              <div className="product-card-meta">${Number(post.product_price).toFixed(2)}</div>
            </div>
            <button className="btn-primary" onClick={() => navigate(`/product/${post.product_id}`)}>Buy</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <button onClick={toggleLike} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: liked ? '#dc2626' : 'inherit' }}>
            <Icon name={liked ? 'heartFilled' : 'heart'} size={18} /> {likeCount}
          </button>
          <button onClick={loadComments} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="message" size={18} /> {post.comment_count}
          </button>
          <button onClick={share} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="share" size={18} /> {post.share_count}
          </button>
          <button onClick={toggleSave} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: saved ? 'var(--forest)' : 'inherit' }}>
            <Icon name={saved ? 'starFilled' : 'star'} size={18} /> {saveCount}
          </button>
        </div>

        {showComments && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--cream-dim)', paddingTop: 10 }}>
            {comments === null && <div className="product-card-meta">Loading comments…</div>}
            {comments?.map((c) => (
              <div key={c.id} className="product-card-meta" style={{ marginBottom: 6 }}>
                <strong>{c.username}</strong> {c.comment_text}
              </div>
            ))}
            {comments?.length === 0 && <div className="product-card-meta">No comments yet.</div>}
            <div className="field-row" style={{ marginTop: 8 }}>
              <div className="field-group" style={{ flex: 1 }}>
                <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                       onKeyDown={(e) => e.key === 'Enter' && postComment()} placeholder="Write a comment…" />
              </div>
              <button className="btn-secondary" onClick={postComment}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
