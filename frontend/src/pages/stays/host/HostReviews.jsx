import { useEffect, useState } from 'react';
import * as staysApi from '../../../api/staysApi';
import { REVIEW_CATEGORIES } from '../staysConstants';
import HostNav from './HostNav';

export default function HostReviews() {
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});

  const load = async () => {
    try {
      const { data } = await staysApi.listHostReviews();
      setReviews(data.reviews || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your reviews.');
    }
  };
  useEffect(() => { load(); }, []);

  const reply = async (id) => {
    const text = replyDrafts[id];
    if (!text || !text.trim()) return;
    try {
      await staysApi.replyToReview(id, text.trim());
      setReplyDrafts({ ...replyDrafts, [id]: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not post reply.');
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1>Reviews</h1>
      <HostNav />
      {error && <div className="apf-error-text">{error}</div>}
      {reviews.length === 0 && <div className="empty-state">No reviews yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reviews.map((r) => (
          <div key={r.id} className="card-surface" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{r.property_title}</strong>
              <span style={{ fontWeight: 700 }}>★ {r.overall_rating}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#8A9189' }}>from {r.guest_display_name || 'Guest'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.75rem', color: '#8A9189', margin: '4px 0' }}>
              {REVIEW_CATEGORIES.map((c) => <span key={c.key}>{c.label}: {r[c.key]}</span>)}
            </div>
            {r.comment && <p style={{ margin: '6px 0', color: '#3A4640' }}>{r.comment}</p>}

            {r.host_reply ? (
              <div style={{ background: '#EEF4EF', borderRadius: 8, padding: 8, marginTop: 6, fontSize: '0.85rem' }}>
                <strong>Your reply:</strong> {r.host_reply}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  placeholder="Reply to this review…" style={{ flex: 1 }}
                  value={replyDrafts[r.id] || ''}
                  onChange={(e) => setReplyDrafts({ ...replyDrafts, [r.id]: e.target.value })}
                />
                <button className="btn-secondary" onClick={() => reply(r.id)}>Reply</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
