import { useEffect, useState } from 'react';
import * as logisticsApi from '../../api/logisticsHubApi';

const PROVIDER_TYPES = ['local_courier', 'last_mile', 'trucking', 'freight_forwarding', 'air_freight', 'sea_freight', 'warehouse', 'customs_broker'];
const STATUS_OPTIONS = ['booked', 'pickup_scheduled', 'picked_up', 'in_transit', 'customs', 'delivered', 'cancelled'];

function AddProviderForm({ onAdded }) {
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState(PROVIDER_TYPES[0]);
  const [countries, setCountries] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await logisticsApi.adminCreateProvider({
        name: name.trim(), providerType,
        countriesServed: countries.split(',').map((c) => c.trim()).filter(Boolean)
      });
      setName(''); setCountries('');
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div className="field-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
        <label>Provider name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label>Type</label>
        <select value={providerType} onChange={(e) => setProviderType(e.target.value)}>
          {PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
      </div>
      <div className="field-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
        <label>Countries served (comma-separated)</label>
        <input value={countries} onChange={(e) => setCountries(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add provider'}</button>
    </form>
  );
}

function SubmitRateForm({ onSubmitted }) {
  const [quoteId, setQuoteId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [price, setPrice] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!quoteId || !providerId || !price) return;
    setBusy(true);
    setError('');
    try {
      await logisticsApi.adminSubmitQuoteOption({
        quoteId, providerId, serviceType: serviceType || undefined,
        price: Number(price), estimatedDays: estimatedDays ? Number(estimatedDays) : undefined
      });
      setQuoteId(''); setProviderId(''); setServiceType(''); setPrice(''); setEstimatedDays('');
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit rate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Enter a rate</h3>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 160 }}>
          <label>Quote ID</label>
          <input value={quoteId} onChange={(e) => setQuoteId(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 160 }}>
          <label>Provider ID</label>
          <input value={providerId} onChange={(e) => setProviderId(e.target.value)} />
        </div>
      </div>
      <div className="field-group">
        <label>Service description</label>
        <input value={serviceType} onChange={(e) => setServiceType(e.target.value)} placeholder="Door-to-door sea freight, 20ft container" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <label>Price (USD)</label>
          <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label>Estimated days</label>
          <input type="number" min="0" value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)} />
        </div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit rate'}</button>
    </form>
  );
}

function BookingsQueue() {
  const [bookings, setBookings] = useState([]);
  const [statusForm, setStatusForm] = useState({});

  const load = async () => {
    const { data } = await logisticsApi.adminListBookings();
    setBookings(data.bookings || []);
  };
  useEffect(() => { load(); }, []);

  const update = async (id) => {
    const form = statusForm[id] || {};
    if (!form.status) return;
    await logisticsApi.adminAddTrackingEvent(id, form);
    load();
  };

  return (
    <div>
      <h3>Active bookings</h3>
      {bookings.length === 0 && <div className="empty-state">No bookings.</div>}
      {bookings.map((b) => (
        <div key={b.id} className="card-surface" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>{b.provider_name}</strong>
            <span className="product-card-badge">{b.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <select value={statusForm[b.id]?.status || ''} onChange={(e) => setStatusForm({ ...statusForm, [b.id]: { ...statusForm[b.id], status: e.target.value } })}>
              <option value="">Update status…</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <input placeholder="Location" value={statusForm[b.id]?.location || ''} onChange={(e) => setStatusForm({ ...statusForm, [b.id]: { ...statusForm[b.id], location: e.target.value } })} />
            <input placeholder="Note" value={statusForm[b.id]?.note || ''} onChange={(e) => setStatusForm({ ...statusForm, [b.id]: { ...statusForm[b.id], note: e.target.value } })} style={{ flex: 1, minWidth: 140 }} />
            <button className="btn-link" onClick={() => update(b.id)}>Post update</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminLogisticsHubPanel() {
  const [providers, setProviders] = useState([]);

  const loadProviders = async () => {
    const { data } = await logisticsApi.listProviders();
    setProviders(data.providers || []);
  };
  useEffect(() => { loadProviders(); }, []);

  return (
    <div>
      <AddProviderForm onAdded={loadProviders} />

      <h3>Providers</h3>
      {providers.map((p) => (
        <div key={p.id} className="card-surface" style={{ marginBottom: 8 }}>
          <strong>{p.name}</strong> · {p.provider_type.replace('_', ' ')} · {p.integration_type}
          <div className="product-card-meta">ID: {p.id} · Serves: {p.countries_served.join(', ') || '—'}</div>
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <SubmitRateForm onSubmitted={() => {}} />
      </div>

      <BookingsQueue />
    </div>
  );
}
