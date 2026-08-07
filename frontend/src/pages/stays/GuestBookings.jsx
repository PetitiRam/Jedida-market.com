import { useEffect, useState } from 'react';
import * as staysApi from '../../api/staysApi';
import StayPassCard from './StayPassCard';
import GuestNav from './GuestNav';
import ReviewForm from './ReviewForm';

const STATUS_LABELS = {
  pending_payment: { label: 'Awaiting Payment', color: '#B98900' },
  payment_submitted: { label: 'Verifying Payment', color: '#B98900' },
  confirmed: { label: 'Confirmed', color: '#1E7A3E' },
  completed: { label: 'Completed', color: '#5B6760' },
  cancelled: { label: 'Cancelled', color: '#8A9189' },
  refunded: { label: 'Refunded', color: '#8A9189' },
  rejected: { label: 'Payment Rejected', color: '#C23B3B' },
};

export default function GuestBookings() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await staysApi.myBookingsAsGuest();
      setBookings(data.bookings || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const cancel = async (b) => {
    const reason = window.prompt('Reason for cancelling (optional):') || '';
    try {
      await staysApi.cancelBooking(b.id, reason);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not cancel booking.');
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1>My Trips</h1>
      <GuestNav />
      {error && <div className="apf-error-text">{error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && bookings.length === 0 && <div className="empty-state">No bookings yet — browse Jedida Stays to plan your next trip.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {bookings.map((b) => {
          const s = STATUS_LABELS[b.status] || { label: b.status, color: '#8A9189' };
          const cancellable = ['pending_payment', 'payment_submitted', 'confirmed'].includes(b.status) && new Date(b.check_in) > new Date();
          return (
            <div key={b.id} className="card-surface" style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 80, height: 60, borderRadius: 8, flexShrink: 0, background: b.cover_image ? `url(${b.cover_image}) center/cover` : '#EEF4EF' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong>{b.property_title}</strong>
                    <span style={{ fontSize: '0.72rem', color: s.color, fontWeight: 600 }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>
                    {b.check_in} → {b.check_out} · {b.nights} night{b.nights === 1 ? '' : 's'} · {b.guests_count} guest{b.guests_count === 1 ? '' : 's'}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{b.currency} {Number(b.total_amount).toLocaleString()}</div>
                </div>
                {cancellable && <button className="btn-secondary" onClick={() => cancel(b)}>Cancel</button>}
              </div>
              {['confirmed', 'completed'].includes(b.status) && <StayPassCard bookingId={b.id} />}
              {b.status === 'completed' && <ReviewForm bookingId={b.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
