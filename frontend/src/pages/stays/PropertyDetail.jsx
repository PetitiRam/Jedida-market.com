import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as staysApi from '../../api/staysApi';
import { propertyTypeLabel } from './staysConstants';
import TrustBadges from './TrustBadges';
import ReviewsList from './ReviewsList';

export default function PropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [media, setMedia] = useState([]);
  const [offers, setOffers] = useState([]);
  const [activeMedia, setActiveMedia] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    staysApi.getProperty(id)
      .then(({ data }) => {
        setProperty(data.property);
        setMedia(data.media || []);
        setOffers(data.offers || []);
      })
      .catch((err) => setError(err.response?.data?.error || 'This property could not be found.'));
  }, [id]);

  const toggleSave = async () => {
    try {
      const { data } = await staysApi.toggleSavedProperty(id);
      setSaved(data.saved);
    } catch (err) {
      if (err.response?.status === 401) navigate('/login');
    }
  };

  if (error) return <div className="empty-state" style={{ padding: 40 }}>{error}</div>;
  if (!property) return <div className="empty-state" style={{ padding: 40 }}>Loading…</div>;

  const cover = media[activeMedia] || media[0];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <Link to="/stays" style={{ fontSize: '0.85rem' }}>&larr; Back to Jedida Stays</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{property.title}</h1>
          <div style={{ color: '#5B6760', marginBottom: 8 }}>
            {propertyTypeLabel(property.property_type)} · {property.city}{property.country ? `, ${property.country}` : ''}
            {property.avg_rating != null && <> · ★ {property.avg_rating} ({property.reviews_count} review{property.reviews_count === 1 ? '' : 's'})</>}
          </div>
          <TrustBadges badges={property.trust_badges} />
          <div style={{ marginBottom: 8 }} />
        </div>
        <button className="btn-secondary" onClick={toggleSave}>{saved ? '❤️ Saved' : '🤍 Save'}</button>
      </div>

      {media.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            height: 360, borderRadius: 12, overflow: 'hidden',
            background: cover?.media_type === 'video' ? '#000' : `#EEF4EF`,
          }}>
            {cover?.media_type === 'video' ? (
              <video src={cover.url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <img src={cover?.url} alt={property.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto' }}>
            {media.map((m, i) => (
              <img
                key={m.id}
                src={m.thumbnail_url || m.url}
                onClick={() => setActiveMedia(i)}
                style={{
                  width: 70, height: 50, objectFit: 'cover', borderRadius: 6, cursor: 'pointer',
                  border: i === activeMedia ? '2px solid #1E293B' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ marginBottom: 20 }}>No photos uploaded yet.</div>
      )}

      {offers.length > 0 && (
        <div className="card-surface" style={{ padding: 12, marginBottom: 16, background: '#FFF7E6' }}>
          {offers.map((o) => (
            <div key={o.id}>🏷️ <strong>{o.title}</strong> — {o.discount_percent}% off, {o.start_date} to {o.end_date}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div>
          <section style={{ marginBottom: 20 }}>
            <h3>About this property</h3>
            <p style={{ color: '#3A4640', whiteSpace: 'pre-wrap' }}>{property.description || 'No description provided yet.'}</p>
          </section>

          {Array.isArray(property.highlights) && property.highlights.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h3>Highlights</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {property.highlights.map((h, i) => (
                  <span key={i} style={{ fontSize: '0.8rem', background: '#EEF4EF', padding: '4px 10px', borderRadius: 999 }}>{h}</span>
                ))}
              </div>
            </section>
          )}

          {Array.isArray(property.amenities) && property.amenities.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h3>Amenities</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {property.amenities.map((a, i) => (
                  <span key={i} style={{ fontSize: '0.8rem', background: '#EEF4EF', padding: '4px 10px', borderRadius: 999 }}>{a}</span>
                ))}
              </div>
            </section>
          )}

          {property.house_rules && (
            <section style={{ marginBottom: 20 }}>
              <h3>House Rules</h3>
              <p style={{ whiteSpace: 'pre-wrap', color: '#3A4640' }}>{property.house_rules}</p>
            </section>
          )}

          {property.cancellation_policy && (
            <section style={{ marginBottom: 20 }}>
              <h3>Cancellation Policy</h3>
              <p style={{ color: '#3A4640' }}>{property.cancellation_policy}</p>
            </section>
          )}

          <ReviewsList propertyId={property.id} />
        </div>

        <aside>
          <BookingWidget property={property} />
        </aside>
      </div>
    </div>
  );
}

function BookingWidget({ property }) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [method, setMethod] = useState('mtn_mobile_money');
  const [booking, setBooking] = useState(null);
  const [instructions, setInstructions] = useState(null);
  const [proof, setProof] = useState({ phoneNumber: '', transactionReference: '', proofImage: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const book = async () => {
    if (!checkIn || !checkOut) { setError('Choose check-in and check-out dates.'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await staysApi.createBooking(property.id, {
        check_in: checkIn, check_out: checkOut, guests_count: Number(guests), method,
      });
      setBooking(data.booking);
      setInstructions(data.paymentInstructions);
      setMessage('Booking created — complete payment below to confirm your stay.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create booking.');
    } finally {
      setLoading(false);
    }
  };

  const submitPayment = async () => {
    if (!proof.transactionReference || !proof.proofImage) { setError('Transaction reference and proof image URL are required.'); return; }
    setLoading(true);
    setError('');
    try {
      await staysApi.submitBookingPayment(booking.id, proof);
      setMessage('Payment submitted. Our team will verify it and confirm your booking shortly.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit payment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="card-surface" style={{ padding: 16, alignSelf: 'start' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>
        {property.currency} {Number(property.base_price).toLocaleString()} <span style={{ fontWeight: 400, fontSize: '0.85rem', color: '#8A9189' }}>/ night</span>
      </div>
      {Number(property.cleaning_fee) > 0 && (
        <div style={{ fontSize: '0.82rem', color: '#5B6760' }}>+ {property.currency} {property.cleaning_fee} cleaning fee</div>
      )}
      <div style={{ fontSize: '0.82rem', color: '#5B6760', marginTop: 8 }}>
        Check-in {property.check_in_time?.slice(0, 5)} · Check-out {property.check_out_time?.slice(0, 5)}
      </div>
      <div style={{ fontSize: '0.82rem', color: '#5B6760', marginTop: 4 }}>
        Up to {property.max_guests} guests · {property.bedrooms} bed{property.bedrooms === 1 ? '' : 's'} · {property.bathrooms} bath{property.bathrooms === 1 ? '' : 's'}
      </div>

      {error && <div className="apf-error-text" style={{ marginTop: 10 }}>{error}</div>}
      {message && <div style={{ color: '#1E7A3E', fontSize: '0.82rem', marginTop: 10 }}>{message}</div>}

      {!booking ? (
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Check-in</label>
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} style={{ width: '100%' }} />
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginTop: 8 }}>Check-out</label>
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} style={{ width: '100%' }} />
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginTop: 8 }}>Guests</label>
          <input type="number" min="1" max={property.max_guests} value={guests} onChange={(e) => setGuests(e.target.value)} style={{ width: '100%' }} />
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginTop: 8 }}>Payment Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ width: '100%' }}>
            <option value="mtn_mobile_money">MTN Mobile Money</option>
            <option value="airtel_money">Airtel Money</option>
          </select>
          <button className="btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={book} disabled={loading}>
            {loading ? 'Requesting…' : 'Request to Book'}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>
            Total due: <strong>{booking.currency} {Number(booking.total_amount).toLocaleString()}</strong> for {booking.nights} night(s)
          </div>
          {instructions?.instructions && (
            <div style={{ fontSize: '0.8rem', background: '#EEF4EF', padding: 10, borderRadius: 8, marginBottom: 10 }}>
              {instructions.instructions}
            </div>
          )}
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block' }}>Your Phone Number</label>
          <input value={proof.phoneNumber} onChange={(e) => setProof({ ...proof, phoneNumber: e.target.value })} style={{ width: '100%' }} />
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginTop: 8 }}>Transaction Reference</label>
          <input value={proof.transactionReference} onChange={(e) => setProof({ ...proof, transactionReference: e.target.value })} style={{ width: '100%' }} />
          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginTop: 8 }}>Proof Screenshot URL</label>
          <input value={proof.proofImage} onChange={(e) => setProof({ ...proof, proofImage: e.target.value })} style={{ width: '100%' }} placeholder="Upload via your device, paste the link here" />
          <button className="btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={submitPayment} disabled={loading}>
            {loading ? 'Submitting…' : 'Submit Payment Proof'}
          </button>
        </div>
      )}
    </aside>
  );
}
