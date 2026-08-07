import { useEffect, useState } from 'react';
import * as staysApi from '../../../api/staysApi';
import HostNav from './HostNav';

const STATUS_LABELS = {
  pending_payment: { label: 'Awaiting Payment', color: '#B98900' },
  payment_submitted: { label: 'Verifying Payment', color: '#B98900' },
  confirmed: { label: 'Confirmed', color: '#1E7A3E' },
  completed: { label: 'Completed', color: '#5B6760' },
  cancelled: { label: 'Cancelled', color: '#8A9189' },
  refunded: { label: 'Refunded', color: '#8A9189' },
  rejected: { label: 'Payment Rejected', color: '#C23B3B' },
};

export default function HostBookings() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await staysApi.myBookingsAsHost();
      setBookings(data.bookings || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const complete = async (b) => {
    try {
      const { data } = await staysApi.completeBooking(b.id);
      alert(`Payout released: ${b.currency} ${data.hostAmount?.toFixed?.(2) ?? ''}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not complete this booking yet.');
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <HostNav />
      <h1>Reservations</h1>
      {error && <div className="apf-error-text">{error}</div>}
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && bookings.length === 0 && <div className="empty-state">No reservations yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {bookings.map((b) => {
          const s = STATUS_LABELS[b.status] || { label: b.status, color: '#8A9189' };
          const canComplete = b.status === 'confirmed' && new Date(b.check_out) <= new Date();
          return (
            <div key={b.id} className="card-surface" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{b.property_title}</strong>
                  <span style={{ marginLeft: 8, fontSize: '0.72rem', color: s.color, fontWeight: 600 }}>{s.label}</span>
                  <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>
                    {b.check_in} → {b.check_out} · Guest: {b.guest_username || b.guest_email}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{b.currency} {Number(b.total_amount).toLocaleString()}</div>
                </div>
                {canComplete && <button className="btn-primary" onClick={() => complete(b)}>Mark Completed & Release Payout</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
