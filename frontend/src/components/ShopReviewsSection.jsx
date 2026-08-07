import { useEffect, useState } from 'react';
import * as enterpriseApi from '../api/enterpriseApi';

export default function ShopReviewsSection({ shopId }) {
  const [reviews, setReviews] = useState(null);
  const [summary, setSummary] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    const { data } = await enterpriseApi.listShopReviews(shopId);
    setReviews(data.reviews || []);
    setSummary(data.summary || null);
  };
  useEffect(() => { load(); }, [shopId]);

  const submit = async () => {
    setBusy(true);
    setNotice('');
    try {
      await enterpriseApi.createShopReview(shopId, { rating, comment });
      setComment('');
      load();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not submit review.');
    } finally {
      setBusy(false);
    }
  };

  if (reviews === null) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <div className="weave-divider" style={{ marginBottom: 20 }} />
      <h3 style={{ marginBottom: 8 }}>Store Reviews</h3>
      {summary && Number(summary.total) > 0 && (
        <p className="product-card-meta" style={{ marginBottom: 14 }}>
          {Number(summary.average).toFixed(1)}/5 average from {summary.total} review(s)
        </p>
      )}

      {reviews.length === 0 && <div className="empty-state">No store reviews yet.</div>}
      {reviews.map((r) => (
        <div key={r.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} <span style={{ fontWeight: 400, fontSize: '0.85rem' }}>{r.full_name}</span></div>
          {r.comment && <p style={{ marginTop: 4, fontSize: '0.85rem', color: '#5B6760' }}>{r.comment}</p>}
        </div>
      ))}

      <div className="card-surface" style={{ marginTop: 14 }}>
        {notice && <div className="alert alert-error">{notice}</div>}
        <div className="field-group">
          <label>Your rating</label>
          <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label>Comment (optional)</label>
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit review'}</button>
        <p className="product-card-meta" style={{ marginTop: 6 }}>You can only review a store after a completed order with them.</p>
      </div>
    </div>
  );
}
