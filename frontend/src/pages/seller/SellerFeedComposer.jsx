import { useEffect, useState } from 'react';
import client from '../../api/client';
import MediaUploader from '../../components/MediaUploader';
import FeedPostCard from '../../components/feed/FeedPostCard';

const POST_TYPES = [
  ['general', 'General'], ['product_update', 'Product Update'], ['new_arrival', '🆕 New Arrival'],
  ['promotion', '🏷️ Promotion'], ['restock', '📦 Restocked'], ['behind_the_scenes', 'Behind the Scenes'],
  ['business_story', 'Our Story'], ['testimonial', '⭐ Customer Testimonial'], ['limited_time_offer', '⏰ Limited-Time Offer']
];

export default function SellerFeedComposer() {
  const [posts, setPosts] = useState([]);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [myProducts, setMyProducts] = useState([]);

  const [postType, setPostType] = useState('general');
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState([]);
  const [productId, setProductId] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [offerEndsAt, setOfferEndsAt] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/shop-feed/posts/mine');
      setPosts(data.posts);
      setIsVerified(data.shopIsVerified);
    } catch {
      setIsVerified(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    client.get('/products/mine').then(({ data }) => setMyProducts(data.products || data || [])).catch(() => {});
  }, []);

  const resetForm = () => {
    setPostType('general'); setCaption(''); setMedia([]); setProductId(''); setDiscountPercent(''); setOfferEndsAt('');
  };

  const submit = async () => {
    setPosting(true);
    try {
      await client.post('/shop-feed/posts', {
        postType, caption, media,
        productId: productId || undefined,
        discountPercent: discountPercent ? Number(discountPercent) : undefined,
        offerEndsAt: postType === 'limited_time_offer' && offerEndsAt ? offerEndsAt : undefined
      });
      resetForm();
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not post.');
    } finally {
      setPosting(false);
    }
  };

  const removePost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    await client.delete(`/shop-feed/posts/${postId}`);
    await load();
  };

  if (loading) return <div className="empty-state">Loading your Shop Feed…</div>;

  if (!isVerified) {
    return (
      <div className="card-surface">
        <h3>📣 Shop Feed — Verified Shops only</h3>
        <p className="product-card-meta">
          The Shop Feed is a benefit of becoming a Verified Shop. Once your shop meets every
          requirement (500+ completed orders, 1,000+ real followers, a strong trust score, and a
          complete business profile), you'll be able to post product updates, promotions, restocks,
          and more here. Check your ✅ Verification tab to see what's still needed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="card-surface" style={{ marginBottom: 16 }}>
        <strong>New post</strong>
        <div className="field-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <div className="field-group">
            <select value={postType} onChange={(e) => setPostType(e.target.value)}>
              {POST_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div className="field-group">
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">No product attached</option>
              {myProducts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>

        <textarea
          value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} style={{ width: '100%', marginTop: 8 }}
          placeholder="What's new at your shop?"
        />

        <div className="field-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <div className="field-group">
            <input type="number" min="1" max="99" placeholder="Discount % (optional)" value={discountPercent}
                   onChange={(e) => setDiscountPercent(e.target.value)} />
          </div>
          {postType === 'limited_time_offer' && (
            <div className="field-group">
              <input type="datetime-local" value={offerEndsAt} onChange={(e) => setOfferEndsAt(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <MediaUploader
            label="Add photo or video"
            onUploaded={(m) => setMedia((prev) => [...prev, { url: m.url, media_type: m.media_type, thumbnail_url: m.thumbnail_url }])}
          />
          {media.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {media.map((m, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  {m.media_type === 'video'
                    ? <video src={m.url} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                    : <img src={m.url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />}
                  <button onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -6, right: -6, borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', width: 18, height: 18, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="btn-primary" style={{ marginTop: 10 }} disabled={posting} onClick={submit}>
          {posting ? 'Posting…' : 'Post to Shop Feed'}
        </button>
      </div>

      <strong>Your posts</strong>
      <div style={{ marginTop: 10 }}>
        {posts.length === 0 && <div className="empty-state">You haven't posted anything yet.</div>}
        {posts.map((p) => (
          <div key={p.id} style={{ position: 'relative' }}>
            <FeedPostCard post={{ ...p, viewer_liked: false, viewer_saved: false }} showShopHeader={false} />
            <button className="btn-secondary" style={{ marginTop: -10, marginBottom: 16 }} onClick={() => removePost(p.id)}>Delete post</button>
          </div>
        ))}
      </div>
    </div>
  );
}
