import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import client from '../../api/client';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import TrackingTimeline from '../../components/TrackingTimeline';

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api', '')
  : 'http://localhost:5000';

export default function OrderTracking() {
  const { orderId } = useParams();
  const [delivery, setDelivery] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [error, setError] = useState('');
  const [liveLocation, setLiveLocation] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    client.get(`/deliveries/by-order/${orderId}`)
      .then(({ data }) => {
        setDelivery(data.delivery);
        setTimeline(data.timeline);
        if (data.delivery.current_lat && data.delivery.current_lng) {
          setLiveLocation({ lat: data.delivery.current_lat, lng: data.delivery.current_lng, updatedAt: data.delivery.location_updated_at });
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'No tracking information available yet.'));
  }, [orderId]);

  // Live updates over the same authenticated socket connection used for chat.
  useEffect(() => {
    if (!delivery?.id) return;
    const token = localStorage.getItem('jedida_access_token');
    if (!token) return;

    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('delivery:join', { deliveryId: delivery.id });
    });

    socket.on('delivery:status', ({ delivery: updated, note }) => {
      setDelivery(updated);
      setTimeline((prev) => [...prev, { status: updated.status, note, created_at: new Date().toISOString() }]);
    });

    socket.on('delivery:location', ({ lat, lng, updatedAt }) => {
      setLiveLocation({ lat, lng, updatedAt });
    });

    return () => socket.disconnect();
  }, [delivery?.id]);

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body" style={{ maxWidth: 600 }}>
        <h2>Track your order</h2>
        {error ? <div className="empty-state">{error}</div> : !delivery ? (
          <div className="empty-state">Loading…</div>
        ) : (
          <div className="card-surface">
            <p className="product-card-meta">
              {delivery.pickup_address && <>From {delivery.pickup_address} </>}
              {delivery.dropoff_address && <>→ {delivery.dropoff_address}</>}
            </p>
            {delivery.estimated_at && (
              <p className="product-card-meta">Estimated delivery: {new Date(delivery.estimated_at).toLocaleString()}</p>
            )}

            {delivery.status === 'out_for_delivery' && (
              <div style={{ background: '#EFF7EF', borderRadius: 10, padding: 12, marginTop: 12 }}>
                {liveLocation ? (
                  <>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--forest)' }}>🚚 Your driver is on the way</p>
                    <p className="product-card-meta" style={{ margin: '4px 0' }}>
                      Last updated {new Date(liveLocation.updatedAt).toLocaleTimeString()}
                    </p>
                    <a
                      className="btn-secondary"
                      style={{ display: 'inline-block', marginTop: 6, textDecoration: 'none' }}
                      href={`https://www.google.com/maps?q=${liveLocation.lat},${liveLocation.lng}`}
                      target="_blank" rel="noreferrer"
                    >
                      📍 View driver's live location
                    </a>
                  </>
                ) : (
                  <p className="product-card-meta" style={{ margin: 0 }}>
                    Waiting for your driver to start sharing their live location…
                  </p>
                )}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <TrackingTimeline events={timeline} currentStatus={delivery.status} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
