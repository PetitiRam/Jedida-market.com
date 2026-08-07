import { useState, useEffect } from 'react';
import SpecsTable from './SpecsTable';
import Icon from '../icons/icon';
import * as reviewsApi from '../../api/reviewsApi';

const TABS = [
  'Overview', 'Specifications', 'Description', 'Features', 'Package Contents',
  'Shipping', 'Reviews', 'Q&A', 'Certificates', 'Downloads', 'Related Products'
];

export default function ProductTabs({ product }) {
  const [active, setActive] = useState('Overview');
  const specs = product.specs || {};

  return (
    <div>
      <div className="tab-scroll">
        {TABS.map((t) => (
          <button key={t} className={`tab-pill ${active === t ? 'tab-pill-active' : ''}`} onClick={() => setActive(t)}>{t}</button>
        ))}
      </div>

      <div className="tab-panel" style={{ minHeight: 200 }}>
        {active === 'Overview' && (
          <div>
            <p>{product.description}</p>
            {specs.keywords && (
              <p style={{ marginTop: 10, fontSize: '0.8rem', color: '#8A9189' }}>
                Keywords: {(Array.isArray(specs.keywords) ? specs.keywords : String(specs.keywords).split(',')).join(', ')}
              </p>
            )}
          </div>
        )}

        {active === 'Specifications' && <SpecsTable specs={specs} sku={product.sku} />}

        {active === 'Description' && (
          <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{product.description || 'No description provided yet.'}</div>
        )}

        {active === 'Features' && (
          specs.features?.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {specs.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cream-dim)', padding: 12, borderRadius: 10 }}>
                  <Icon name="checkShield" size={16} />
                  <span style={{ fontSize: '0.85rem' }}>{f}</span>
                </div>
              ))}
            </div>
          ) : <EmptyTab text="No features listed yet." />
        )}

        {active === 'Package Contents' && (
          specs.package_contents?.length > 0 ? (
            <ul>{specs.package_contents.map((item, i) => <li key={i}>{item}</li>)}</ul>
          ) : <EmptyTab text="No package contents listed yet." />
        )}

{active === 'Shipping' && (() => {
  const shipping =
    typeof product.shipping_options === "string"
      ? JSON.parse(product.shipping_options)
      : (product.shipping_options || {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      <Row
        label="Ships From"
        value={[product.location_city, product.location_country]
          .filter(Boolean)
          .join(", ")}
      />

      <Row
        label="Warehouse"
        value={shipping.warehouseLocation}
      />

      <Row
        label="Delivery Time"
        value={shipping.deliveryTime}
      />

      <Row
        label="Shipping Cost"
        value={
          shipping.shippingCost
            ? `${product.currency} ${shipping.shippingCost}`
            : "Free"
        }
      />

      {!shipping.warehouseLocation &&
       !shipping.deliveryTime &&
       !shipping.shippingCost && (
        <EmptyTab text="Shipping information has not been added yet." />
      )}

    </div>
  );
})()}
        {active === 'Reviews' && <ReviewsTab productId={product.id} />}
        {active === 'Q&A' && <QandATab productId={product.id} />}

        {active === 'Certificates' && (
          specs.certificates?.length > 0 ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {specs.certificates.map((url, i) => <img key={i} src={url} alt="Certificate" style={{ width: 140, borderRadius: 8, border: '1px solid var(--line)' }} />)}
            </div>
          ) : <EmptyTab text="No certificates uploaded yet." />
        )}

        {active === 'Downloads' && (
          specs.downloads?.length > 0 ? (
            <ul>{specs.downloads.map((d, i) => <li key={i}><a href={d.url} target="_blank" rel="noreferrer">{d.label || d.url}</a></li>)}</ul>
          ) : <EmptyTab text="No downloadable files for this product yet." />
        )}

        {active === 'Related Products' && <div className="empty-state">Related products carousel renders below the tabs.</div>}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
      <span style={{ color: '#8A9189' }}>{label}</span><strong>{value}</strong>
    </div>
  );
}
function EmptyTab({ text }) {
  return <div className="empty-state">{text}</div>;
}

function ReviewsTab({ productId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setError('');
    reviewsApi.getReviews(productId)
      .then(({ data }) => setData(data))
      .catch((err) => {
        console.error('Load reviews failed:', err);
        setError(err.response?.status === 404
          ? 'Reviews are not available yet — this feature may not be fully set up on the server.'
          : 'Could not load reviews. Please try again.');
      });
  };
  useEffect(() => { load(); }, [productId]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await reviewsApi.submitReview(productId, { rating, comment });
      setComment('');
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (reviewId) => {
    try {
      await reviewsApi.markReviewHelpful(reviewId);
      load();
    } catch (err) {
      console.error('Vote failed:', err);
    }
  };

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="empty-state">Loading reviews…</div>;
  const { reviews, summary } = data;

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800 }}>{Number(summary.average).toFixed(1)}</div>
          <div style={{ fontSize: '0.78rem', color: '#8A9189' }}>{summary.total} reviews</div>
        </div>
        <div style={{ flex: 1, fontSize: '0.78rem' }}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = Number(summary[['', 'one', 'two', 'three', 'four', 'five'][star]] || 0);
            const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
            return (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{star}★</span>
                <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 999 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--amber)', borderRadius: 999 }} />
                </div>
                <span>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={submit} className="card-surface" style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Write a review</label>
        <div style={{ margin: '8px 0' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n} type="button" onClick={() => setRating(n)}
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: n <= rating ? 'var(--amber)' : 'var(--line)' }}
            >★</button>
          ))}
        </div>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share your experience with this product…" />
        <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: 8 }}>
          {submitting ? 'Submitting…' : 'Submit review'}
        </button>
      </form>

      {reviews.length === 0 ? <div className="empty-state">No reviews yet — be the first.</div> : (
        reviews.map((r) => (
          <div key={r.id} className="card-surface" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{r.full_name}</strong>
              <span>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
            </div>
            {r.is_verified_buyer && <span className="product-card-badge">Verified Buyer</span>}
            <p style={{ marginTop: 6 }}>{r.comment}</p>
            {r.photos?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {r.photos.map((url, i) => <img key={i} src={url} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8 }} />)}
              </div>
            )}
            {r.seller_reply && (
              <div style={{ marginTop: 8, background: 'var(--cream-dim)', padding: 10, borderRadius: 8, fontSize: '0.85rem' }}>
                <strong>Seller response:</strong> {r.seller_reply}
              </div>
            )}
            <button type="button" className="btn-link" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => vote(r.id)}>
              <Icon name="checkShield" size={14} /> Helpful ({r.helpful_count})
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function QandATab({ productId }) {
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setError('');
    reviewsApi.getQuestions(productId)
      .then(({ data }) => setQuestions(data.questions))
      .catch((err) => {
        console.error('Load questions failed:', err);
        setError('Could not load previous questions.');
      });
  };
  useEffect(() => { load(); }, [productId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await reviewsApi.askQuestion(productId, text);
      setText('');
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not submit question.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Submitting the typed question and "Contact Marketplace" are now
          two SEPARATE, clearly-labeled actions — not one button doing both. */}
      <form onSubmit={submit} className="card-surface" style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Ask a question about this product</label>
        <p style={{ fontSize: '0.78rem', color: '#8A9189', margin: '4px 0 8px' }}>
          Your question goes to the JEDIDA admin team, who relay it to the seller. You'll never be connected to the seller directly.
        </p>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Does this come in a larger size?" />
        <button type="submit" className="btn-primary" disabled={submitting || !text.trim()} style={{ marginTop: 8 }}>
          {submitting ? 'Submitting…' : 'Submit question'}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {questions.length === 0 ? <div className="empty-state">No questions answered yet.</div> : (
        questions.map((q) => (
          <div key={q.id} className="card-surface" style={{ marginBottom: 10 }}>
            <strong>Q: {q.question_text}</strong>
            <p style={{ fontSize: '0.78rem', color: '#8A9189' }}>Asked by {q.asker_name}</p>
            {q.answer_text ? (
              <p style={{ marginTop: 6, background: 'var(--cream-dim)', padding: 10, borderRadius: 8 }}><strong>A:</strong> {q.answer_text}</p>
            ) : (
              <span className="status-chip status-pending_review">Awaiting seller response</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
