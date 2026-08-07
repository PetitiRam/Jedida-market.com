import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as staysApi from '../../api/staysApi';
import GuestNav from './GuestNav';

function StatCard({ label, value, tone }) {
  return (
    <div className="card-surface" style={{ padding: 16, flex: '1 1 140px' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: tone || '#1E293B' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: '#8A9189' }}>{label}</div>
    </div>
  );
}

export default function GuestOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    staysApi.getGuestOverview()
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load your overview.'));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1>🧳 My Stays</h1>
      <GuestNav />
      {error && <div className="apf-error-text">{error}</div>}
      {!data && !error && <div className="empty-state">Loading…</div>}

      {data && (
        <>
          {data.nextTrip ? (
            <div className="card-surface" style={{ display: 'flex', gap: 12, padding: 14, marginBottom: 20, alignItems: 'center' }}>
              <div style={{ width: 90, height: 66, borderRadius: 8, flexShrink: 0, background: data.nextTrip.cover_image ? `url(${data.nextTrip.cover_image}) center/cover` : '#EEF4EF' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: '#8A9189', textTransform: 'uppercase' }}>Your Next Trip</div>
                <strong>{data.nextTrip.property_title}</strong>
                <div style={{ fontSize: '0.82rem', color: '#5B6760' }}>
                  {data.nextTrip.city ? `${data.nextTrip.city} · ` : ''}{data.nextTrip.check_in?.slice?.(0, 10) || data.nextTrip.check_in} → {data.nextTrip.check_out?.slice?.(0, 10) || data.nextTrip.check_out}
                </div>
              </div>
              <button className="btn-secondary" onClick={() => navigate('/guest/bookings')}>View</button>
            </div>
          ) : (
            <div className="empty-state" style={{ marginBottom: 20 }}>
              No upcoming trips yet — <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate('/stays')}>browse Jedida Stays</span>.
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <StatCard label="Upcoming Trips" value={data.upcomingTrips} />
            <StatCard label="Awaiting Payment" value={data.awaitingPayment} tone={data.awaitingPayment > 0 ? '#B98900' : undefined} />
            <StatCard label="Completed Trips" value={data.completedTrips} />
            <StatCard label="Saved Properties" value={data.savedProperties} />
          </div>
        </>
      )}
    </div>
  );
}
