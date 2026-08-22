import { useEffect, useState } from 'react';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as logisticsApi from '../../api/logisticsHubApi';

const STATUS_LABELS = {
  booked: 'Booked', pickup_scheduled: 'Pickup scheduled', picked_up: 'Picked up',
  in_transit: 'In transit', customs: 'In customs', delivered: 'Delivered', cancelled: 'Cancelled'
};

function QuoteForm({ onCreated }) {
  const [form, setForm] = useState({ originCountry: '', originCity: '', destinationCountry: '', destinationCity: '', weightKg: '', cargoDescription: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.originCountry || !form.destinationCountry) return;
    setBusy(true);
    setNotice('');
    try {
      const { data } = await logisticsApi.requestShippingQuote({
        ...form, weightKg: form.weightKg ? Number(form.weightKg) : undefined
      });
      setNotice(`Quote requested — matched ${data.matchedProviders} provider(s).`);
      setForm({ originCountry: '', originCity: '', destinationCountry: '', destinationCity: '', weightKg: '', cargoDescription: '' });
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Get a shipping quote</h3>
      {notice && <div className="alert">{notice}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Origin country</label>
          <input value={form.originCountry} onChange={(e) => setForm({ ...form, originCountry: e.target.value })} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Origin city</label>
          <input value={form.originCity} onChange={(e) => setForm({ ...form, originCity: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Destination country</label>
          <input value={form.destinationCountry} onChange={(e) => setForm({ ...form, destinationCountry: e.target.value })} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 140 }}>
          <label>Destination city</label>
          <input value={form.destinationCity} onChange={(e) => setForm({ ...form, destinationCity: e.target.value })} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 100 }}>
          <label>Weight (kg)</label>
          <input type="number" min="0" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
        </div>
      </div>
      <div className="field-group">
        <label>Cargo description</label>
        <input value={form.cargoDescription} onChange={(e) => setForm({ ...form, cargoDescription: e.target.value })} />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Requesting…' : 'Request quote'}</button>
    </form>
  );
}

function QuoteOptions({ quoteId, onBooked }) {
  const [data, setData] = useState(null);
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await logisticsApi.getShippingQuoteOptions(quoteId);
    setData(data);
  };
  useEffect(() => { load(); }, [quoteId]);

  const book = async (optionId) => {
    setBusy(true);
    try {
      await logisticsApi.createBooking({ quoteId, quoteOptionId: optionId, pickupAddress: pickup || undefined, dropoffAddress: dropoff || undefined });
      onBooked();
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="empty-state">Loading rates…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input placeholder="Pickup address" value={pickup} onChange={(e) => setPickup(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <input placeholder="Dropoff address" value={dropoff} onChange={(e) => setDropoff(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
      </div>
      {data.options.length === 0 && <div className="empty-state">No rates yet — providers respond shortly.</div>}
      {data.options.map((o) => (
        <div key={o.id} className="card-surface" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <strong>{o.provider_name}</strong> · {o.provider_type.replace('_', ' ')}
            <div className="product-card-meta">{o.service_type} {o.estimated_days ? `· ~${o.estimated_days}d` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700 }}>{o.currency} {o.price}</div>
            <button className="btn-primary" disabled={busy} onClick={() => book(o.id)}>Book</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrackingView({ bookingId }) {
  const [data, setData] = useState(null);
  useEffect(() => { logisticsApi.getBookingTracking(bookingId).then(({ data }) => setData(data)); }, [bookingId]);
  if (!data) return <div className="empty-state">Loading…</div>;
  return (
    <div>
      {data.events.map((e) => (
        <div key={e.id} style={{ fontSize: '0.85rem', marginBottom: 4 }}>
          <strong>{STATUS_LABELS[e.status] || e.status}</strong> — {e.note} {e.location ? `(${e.location})` : ''}
          <div className="product-card-meta">{new Date(e.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

export default function LogisticsHub() {
  const [quotes, setQuotes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [openQuoteId, setOpenQuoteId] = useState(null);
  const [openBookingId, setOpenBookingId] = useState(null);

  const load = async () => {
    const [q, b] = await Promise.all([logisticsApi.myShippingQuotes(), logisticsApi.myBookings()]);
    setQuotes(q.data.quotes || []);
    setBookings(b.data.bookings || []);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <h2 style={{ marginBottom: 4 }}>Jedida Logistics Hub</h2>
        <p style={{ color: '#5B6760', marginBottom: 16 }}>Compare shipping rates across providers and track your bookings.</p>

        <QuoteForm onCreated={load} />

        <h3>My quotes</h3>
        {quotes.length === 0 && <div className="empty-state">No quotes yet.</div>}
        {quotes.map((q) => (
          <div key={q.id} className="card-surface" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }} onClick={() => setOpenQuoteId(openQuoteId === q.id ? null : q.id)}>
              <div>{q.origin_country} → {q.destination_country}</div>
              <span className="product-card-badge">{q.option_count} rate(s) · {q.status}</span>
            </div>
            {openQuoteId === q.id && <div style={{ marginTop: 8 }}><QuoteOptions quoteId={q.id} onBooked={() => { setOpenQuoteId(null); load(); }} /></div>}
          </div>
        ))}

        <h3 style={{ marginTop: 20 }}>My bookings</h3>
        {bookings.length === 0 && <div className="empty-state">No bookings yet.</div>}
        {bookings.map((b) => (
          <div key={b.id} className="card-surface" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }} onClick={() => setOpenBookingId(openBookingId === b.id ? null : b.id)}>
              <div>{b.provider_name}</div>
              <span className="product-card-badge">{STATUS_LABELS[b.status] || b.status}</span>
            </div>
            {openBookingId === b.id && <div style={{ marginTop: 8 }}><TrackingView bookingId={b.id} /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
