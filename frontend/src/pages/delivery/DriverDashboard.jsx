import { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import Logo from '../../components/Logo';
import TrackingTimeline, { STATUS_LABELS } from '../../components/TrackingTimeline';

const NEXT_STATUS = {
  assigned_to_driver: 'out_for_delivery',
  out_for_delivery: 'delivered'
};

function DeliveryCard({ delivery, onUpdated }) {
  const [timeline, setTimeline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);

  const loadTimeline = () => client.get(`/deliveries/${delivery.id}/timeline`).then(({ data }) => setTimeline(data.timeline));

  const advance = async (status) => {
    setBusy(true);
    try {
      await client.post(`/deliveries/${delivery.id}/status`, { status, note: `Driver marked as ${STATUS_LABELS[status]}.` });
      onUpdated();
    } finally { setBusy(false); }
  };

  const fail = async () => {
    setBusy(true);
    try {
      await client.post(`/deliveries/${delivery.id}/status`, { status: 'failed_delivery', note: 'Driver reported a failed delivery attempt.' });
      onUpdated();
    } finally { setBusy(false); }
  };

  const toggleLocationSharing = () => {
    if (sharingLocation) {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharingLocation(false);
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocationError('Your device does not support location sharing.');
      return;
    }
    setLocationError('');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentRef.current < 8000) return; // throttle to ~every 8s
        lastSentRef.current = now;
        client.post(`/deliveries/${delivery.id}/location`, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }).catch(() => {});
      },
      () => setLocationError('Could not access your location — check permissions.'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharingLocation(true);
  };

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  const next = NEXT_STATUS[delivery.status];

  return (
    <div className="card-surface" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <strong>Delivery {delivery.id.slice(0, 8)}</strong>
          <div className="product-card-meta">{delivery.dropoff_address || 'No dropoff address on file'}</div>
        </div>
        <span className={`status-chip status-${delivery.status === 'delivered' ? 'active' : 'pending_review'}`}>{STATUS_LABELS[delivery.status] || delivery.status}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {next && <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy} onClick={() => advance(next)}>Mark as {STATUS_LABELS[next]}</button>}
        {delivery.status === 'out_for_delivery' && <button className="btn-secondary" disabled={busy} onClick={fail}>Report failed delivery</button>}
        {delivery.status === 'out_for_delivery' && (
          <button className="btn-secondary" onClick={toggleLocationSharing}>
            {sharingLocation ? '📍 Sharing location — tap to stop' : '📍 Share live location'}
          </button>
        )}
        <button className="btn-link" onClick={() => (timeline ? setTimeline(null) : loadTimeline())}>{timeline ? 'Hide timeline' : 'View timeline'}</button>
      </div>

      {locationError && <p style={{ color: '#8A2E10', fontSize: '0.8rem', marginTop: 6 }}>{locationError}</p>}

      {timeline && <div style={{ marginTop: 14 }}><TrackingTimeline events={timeline} currentStatus={delivery.status} /></div>}
    </div>
  );
}

export default function DriverDashboard() {
  const [driver, setDriver] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ vehicleType: '', licensePlate: '' });

  const load = async () => {
    setLoading(true);
    const profile = await client.get('/deliveries/drivers/me');
    setDriver(profile.data.driver);
    if (profile.data.driver) {
      const { data } = await client.get('/deliveries/mine/driver');
      setDeliveries(data.deliveries || []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const register = async (e) => {
    e.preventDefault();
    await client.post('/deliveries/drivers/register', form);
    load();
  };

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <header className="dash-header"><Logo size={32} /></header>
      <div className="dash-body">
        <h2>Driver Dashboard</h2>

        {!driver ? (
          <div className="card-surface" style={{ maxWidth: 420 }}>
            <h4>Register as a driver</h4>
            <form onSubmit={register}>
              <div className="field-group"><label>Vehicle type</label><input value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} placeholder="Motorcycle, van, bicycle…" /></div>
              <div className="field-group"><label>License plate</label><input value={form.licensePlate} onChange={(e) => setForm({ ...form, licensePlate: e.target.value })} /></div>
              <button className="btn-primary">Register</button>
            </form>
          </div>
        ) : (
          <>
            <p style={{ color: '#5B6760' }}>Vehicle: {driver.vehicle_type || '—'} · Rating: {driver.rating}⭐</p>
            {deliveries.length === 0 ? (
              <div className="empty-state">No deliveries assigned to you yet.</div>
            ) : (
              deliveries.map((d) => <DeliveryCard key={d.id} delivery={d} onUpdated={load} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
