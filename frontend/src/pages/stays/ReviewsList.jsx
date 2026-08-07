import { useEffect, useState } from 'react';
import * as staysApi from '../../api/staysApi';
import { REVIEW_CATEGORIES } from './staysConstants';

export default function ReviewsList({ propertyId }) {
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    staysApi.listPropertyReviews(propertyId)
      .then(({ data }) => setReviews(data.reviews || []))
      .catch((err) => setError(err.response?.data?.error || 'Could not load reviews.'));
  }, [propertyId]);

  if (error) return <div className="apf-error-text">{error}</div>;
  if (reviews.length === 0) return null;

  return (
    <section style={{ marginBottom: 20 }}>
      <h3>Reviews ({reviews.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reviews.map((r) => (
          <div key={r.id} className="card-surface" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{r.guest_display_name || 'Guest'}</strong>
              <span style={{ fontWeight: 700 }}>★ {r.overall_rating}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.75rem', color: '#8A9189', margin: '4px 0' }}>
              {REVIEW_CATEGORIES.map((c) => <span key={c.key}>{c.label}: {r[c.key]}</span>)}
            </div>
            {r.comment && <p style={{ margin: '6px 0', color: '#3A4640' }}>{r.comment}</p>}
            {r.host_reply && (
              <div style={{ background: '#EEF4EF', borderRadius: 8, padding: 8, marginTop: 6, fontSize: '0.85rem' }}>
                <strong>Host response:</strong> {r.host_reply}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
