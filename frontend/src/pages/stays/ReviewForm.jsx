import { useEffect, useState } from 'react';
import * as staysApi from '../../api/staysApi';
import { REVIEW_CATEGORIES } from './staysConstants';

export default function ReviewForm({ bookingId }) {
  const [eligible, setEligible] = useState(null);
  const [form, setForm] = useState(Object.fromEntries(REVIEW_CATEGORIES.map((c) => [c.key, 5])));
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    staysApi.getReviewEligibility(bookingId)
      .then(({ data }) => setEligible(data.eligible))
      .catch(() => setEligible(false));
  }, [bookingId]);

  const submit = async () => {
    setError('');
    try {
      await staysApi.createReview(bookingId, { ...form, comment });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit review.');
    }
  };

  if (eligible === null) return null;
  if (done) return <div style={{ fontSize: '0.82rem', color: '#1E7A3E', marginTop: 6 }}>Thanks for your review!</div>;
  if (!eligible) return null;

  if (!open) {
    return <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>⭐ Leave a Review</button>;
  }

  return (
    <div className="card-surface" style={{ padding: 14, marginTop: 8 }}>
      {error && <div className="apf-error-text">{error}</div>}
      {REVIEW_CATEGORIES.map((c) => (
        <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '0.85rem' }}>{c.label}</span>
          <select value={form[c.key]} onChange={(e) => setForm({ ...form, [c.key]: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      ))}
      <textarea placeholder="Tell other guests about your stay…" value={comment}
        onChange={(e) => setComment(e.target.value)} rows={3} style={{ width: '100%', marginTop: 6 }} />
      <button className="btn-primary" style={{ marginTop: 8 }} onClick={submit}>Submit Review</button>
    </div>
  );
}
