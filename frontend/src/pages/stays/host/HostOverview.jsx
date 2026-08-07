import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as staysApi from '../../../api/staysApi';
import HostNav from './HostNav';

function StatCard({ label, value, tone }) {
  return (
    <div className="card-surface" style={{ padding: 16, flex: '1 1 140px' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: tone || '#1E293B' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: '#8A9189' }}>{label}</div>
    </div>
  );
}

export default function HostOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    staysApi.getHostOverview()
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load your overview.'));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1>🏡 Host Overview</h1>
      <HostNav />
      {error && <div className="apf-error-text">{error}</div>}
      {!data && !error && <div className="empty-state">Loading…</div>}

      {data && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <StatCard label="Active Properties" value={data.properties.active} />
            <StatCard label="Pending Review" value={data.properties.pendingReview} tone={data.properties.pendingReview > 0 ? '#B98900' : undefined} />
            <StatCard label="Paused" value={data.properties.paused} />
            <StatCard label="Revenue This Month" value={`$${data.revenueThisMonth.toLocaleString()}`} tone="#1E7A3E" />
          </div>

          {(data.pendingPaymentVerification > 0 || data.readyToComplete > 0) && (
            <div className="card-surface" style={{ padding: 14, marginBottom: 20, background: '#FFF7E6' }}>
              <strong>Needs your attention</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: '0.85rem' }}>
                {data.pendingPaymentVerification > 0 && (
                  <li>{data.pendingPaymentVerification} booking(s) awaiting payment verification by our team</li>
                )}
                {data.readyToComplete > 0 && (
                  <li>
                    {data.readyToComplete} completed stay(s) ready to be marked complete —{' '}
                    <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate('/host/bookings')}>
                      release payout
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="card-surface" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Upcoming Check-ins (next 7 days)</h3>
            {data.upcomingCheckIns.length === 0 && <div className="empty-state">No check-ins in the next week.</div>}
            {data.upcomingCheckIns.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDEFEC', padding: '8px 0' }}>
                <span>{c.property_title} — {c.guest_name}</span>
                <span style={{ color: '#5B6760' }}>{c.check_in?.slice?.(0, 10) || c.check_in}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
