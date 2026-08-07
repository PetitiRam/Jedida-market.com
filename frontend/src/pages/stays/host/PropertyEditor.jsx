import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as staysApi from '../../../api/staysApi';
import MediaUploader from '../../../components/MediaUploader';
import { PROPERTY_TYPES, OWNER_TYPES, WEEKDAY_LABELS } from '../staysConstants';

const EMPTY_FORM = {
  property_type: 'serviced_apartment', owner_type: 'individual',
  title: '', description: '', house_rules: '', cancellation_policy: '',
  max_guests: 2, bedrooms: 1, bathrooms: 1, beds: 1,
  city: '', country: '', address_line: '',
  base_price: '', currency: 'USD', cleaning_fee: 0, security_deposit: '',
  check_in_time: '14:00', check_out_time: '10:00',
  highlights: [], amenities: [],
};

function TagInput({ label, value, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    onChange([...value, draft.trim()]);
    setDraft('');
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {value.map((v, i) => (
          <span key={i} style={{ fontSize: '0.76rem', background: '#EEF4EF', padding: '3px 9px', borderRadius: 999 }}>
            {v} <span style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => onChange(value.filter((_, idx) => idx !== i))}>✕</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} style={{ flex: 1 }} />
        <button type="button" className="btn-secondary" onClick={add}>Add</button>
      </div>
    </div>
  );
}

const TABS = ['Basics', 'Media', 'Calendar & Pricing', 'Special Offers'];

export default function PropertyEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [tab, setTab] = useState('Basics');
  const [form, setForm] = useState(EMPTY_FORM);
  const [propertyId, setPropertyId] = useState(isNew ? null : id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isNew) return;
    staysApi.getProperty(id).then(({ data }) => {
      const p = data.property;
      setForm({
        ...EMPTY_FORM, ...p,
        highlights: p.highlights || [], amenities: p.amenities || [],
        check_in_time: (p.check_in_time || '14:00:00').slice(0, 5),
        check_out_time: (p.check_out_time || '10:00:00').slice(0, 5),
      });
    }).catch((err) => setError(err.response?.data?.error || 'Could not load property.'));
  }, [id, isNew]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (propertyId) {
        await staysApi.updateProperty(propertyId, form);
        setMessage('Saved.');
      } else {
        const { data } = await staysApi.createProperty(form);
        setPropertyId(data.property.id);
        navigate(`/host/properties/${data.property.id}`, { replace: true });
        setMessage('Property created and submitted for review. You can now add photos and set your calendar.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save property.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h1>{isNew ? 'Add Property' : `Manage: ${form.title || '...'}`}</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #EDEFEC' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            disabled={t !== 'Basics' && !propertyId}
            className="btn-secondary"
            style={{
              border: 'none', borderRadius: 0, background: 'none',
              borderBottom: tab === t ? '2px solid #1E293B' : '2px solid transparent',
              fontWeight: tab === t ? 700 : 400, opacity: (t !== 'Basics' && !propertyId) ? 0.4 : 1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="apf-error-text">{error}</div>}
      {message && <div style={{ color: '#1E7A3E', fontSize: '0.85rem', marginBottom: 12 }}>{message}</div>}

      {tab === 'Basics' && (
        <div className="card-surface" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Property Type</label>
              <select value={form.property_type} onChange={(e) => set('property_type', e.target.value)} style={{ width: '100%' }}>
                {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Owner Type</label>
              <select value={form.owner_type} onChange={(e) => set('owner_type', e.target.value)} style={{ width: '100%' }}>
                {OWNER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginTop: 12 }}>Title</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} style={{ width: '100%' }} placeholder="e.g. Sunset Villa with Private Pool" />

          <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginTop: 12 }}>Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} style={{ width: '100%' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
            {['max_guests', 'bedrooms', 'bathrooms', 'beds'].map((f) => (
              <div key={f}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'capitalize' }}>{f.replace('_', ' ')}</label>
                <input type="number" min="0" value={form[f]} onChange={(e) => set(f, Number(e.target.value))} style={{ width: '100%' }} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>City</label>
              <input value={form.city} onChange={(e) => set('city', e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Country</label>
              <input value={form.country} onChange={(e) => set('country', e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginTop: 12 }}>Address</label>
          <input value={form.address_line} onChange={(e) => set('address_line', e.target.value)} style={{ width: '100%' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Base Price / Night</label>
              <input type="number" min="0" value={form.base_price} onChange={(e) => set('base_price', e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Currency</label>
              <input value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Cleaning Fee</label>
              <input type="number" min="0" value={form.cleaning_fee} onChange={(e) => set('cleaning_fee', e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Check-in Time</label>
              <input type="time" value={form.check_in_time} onChange={(e) => set('check_in_time', e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Check-out Time</label>
              <input type="time" value={form.check_out_time} onChange={(e) => set('check_out_time', e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <TagInput label="Highlights" value={form.highlights} onChange={(v) => set('highlights', v)} placeholder="e.g. Ocean view" />
            <TagInput label="Amenities" value={form.amenities} onChange={(v) => set('amenities', v)} placeholder="e.g. WiFi, Pool, Parking" />
          </div>

          <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginTop: 4 }}>House Rules</label>
          <textarea value={form.house_rules} onChange={(e) => set('house_rules', e.target.value)} rows={3} style={{ width: '100%' }} />

          <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginTop: 12 }}>Cancellation Policy</label>
          <textarea value={form.cancellation_policy} onChange={(e) => set('cancellation_policy', e.target.value)} rows={2} style={{ width: '100%' }} />

          <button className="btn-primary" style={{ marginTop: 16 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (propertyId ? 'Save Changes' : 'Create Property')}
          </button>
        </div>
      )}

      {tab === 'Media' && propertyId && <MediaTab propertyId={propertyId} />}
      {tab === 'Calendar & Pricing' && propertyId && <CalendarTab propertyId={propertyId} basePrice={form.base_price} currency={form.currency} />}
      {tab === 'Special Offers' && propertyId && <OffersTab propertyId={propertyId} currency={form.currency} />}
    </div>
  );
}

// ============================================================
// MEDIA TAB
// ============================================================
function MediaTab({ propertyId }) {
  const [media, setMedia] = useState([]);
  const [error, setError] = useState('');

  const load = () => staysApi.getProperty(propertyId).then(({ data }) => setMedia(data.media || []));
  useEffect(() => { load(); }, [propertyId]);

  const onUploaded = async (uploaded) => {
    try {
      const isVideo = uploaded.media_type === 'video' || uploaded.url?.match(/\.(mp4|webm|mov)$/i);
      await staysApi.addMedia(propertyId, {
        url: uploaded.url,
        thumbnail_url: uploaded.thumbnail_url,
        media_type: isVideo ? 'video' : 'photo',
        is_cover: media.length === 0,
      });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add media.');
    }
  };

  return (
    <div className="card-surface" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Photo & Video Gallery</h3>
      {error && <div className="apf-error-text">{error}</div>}
      <MediaUploader onUploaded={onUploaded} label="Upload photo or video" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginTop: 16 }}>
        {media.map((m) => (
          <div key={m.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
            {m.media_type === 'video' ? (
              <video src={m.url} style={{ width: '100%', height: 90, objectFit: 'cover' }} />
            ) : (
              <img src={m.url} style={{ width: '100%', height: 90, objectFit: 'cover' }} />
            )}
            {m.is_cover && (
              <span style={{ position: 'absolute', top: 4, left: 4, background: '#1E293B', color: '#fff', fontSize: '0.65rem', padding: '2px 6px', borderRadius: 999 }}>Cover</span>
            )}
            <div style={{ display: 'flex', gap: 4, position: 'absolute', bottom: 4, right: 4 }}>
              {!m.is_cover && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                  onClick={async () => { await staysApi.setCoverMedia(propertyId, m.id); load(); }}
                >
                  Set cover
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                onClick={async () => { await staysApi.deleteMedia(propertyId, m.id); load(); }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CALENDAR & PRICING TAB
// ============================================================
function CalendarTab({ propertyId, basePrice, currency }) {
  const [days, setDays] = useState([]);
  const [rules, setRules] = useState([]);
  const [ruleForm, setRuleForm] = useState({ name: '', pricing_type: 'seasonal', start_date: '', end_date: '', price: '', days_of_week: [] });
  const [error, setError] = useState('');

  const today = new Date();
  const rangeStart = today.toISOString().slice(0, 10);
  const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()).toISOString().slice(0, 10);

  const load = async () => {
    const [availRes, rulesRes] = await Promise.all([
      staysApi.getAvailability(propertyId, rangeStart, rangeEnd),
      staysApi.listPricingRules(propertyId),
    ]);
    setDays(availRes.data.days || []);
    setRules(rulesRes.data.rules || []);
  };
  useEffect(() => { load(); }, [propertyId]);

  const toggleBlocked = async (day) => {
    await staysApi.setAvailability(propertyId, [{ date: day.date, is_available: !day.is_available }]);
    load();
  };

  const addRule = async () => {
    if (!ruleForm.name || !ruleForm.price) return;
    try {
      await staysApi.createPricingRule(propertyId, {
        ...ruleForm,
        days_of_week: ruleForm.pricing_type === 'weekend' ? ruleForm.days_of_week : undefined,
        start_date: ruleForm.pricing_type === 'weekend' ? undefined : ruleForm.start_date,
        end_date: ruleForm.pricing_type === 'weekend' ? undefined : ruleForm.end_date,
        price: Number(ruleForm.price),
      });
      setRuleForm({ name: '', pricing_type: 'seasonal', start_date: '', end_date: '', price: '', days_of_week: [] });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create pricing rule.');
    }
  };

  const toggleDow = (i) => {
    setRuleForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(i) ? f.days_of_week.filter((d) => d !== i) : [...f.days_of_week, i],
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card-surface" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Availability — next 2 months</h3>
        <p style={{ fontSize: '0.8rem', color: '#5B6760' }}>Tap a date to block or unblock it. Base rate: {currency} {basePrice}/night.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
          {days.map((d) => (
            <div
              key={d.date}
              onClick={() => toggleBlocked(d)}
              style={{
                cursor: 'pointer', textAlign: 'center', padding: '6px 2px', borderRadius: 6, fontSize: '0.72rem',
                background: d.is_available ? '#EEF4EF' : '#FBE3E3', color: d.is_available ? '#3A4640' : '#C23B3B',
              }}
            >
              <div>{d.date.slice(5)}</div>
              <div style={{ fontWeight: 700 }}>{d.price}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-surface" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Seasonal / Weekend / Holiday Pricing</h3>
        {error && <div className="apf-error-text">{error}</div>}
        {rules.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDEFEC', padding: '8px 0' }}>
            <div>
              <strong>{r.name}</strong>
              <div style={{ fontSize: '0.75rem', color: '#8A9189' }}>
                {r.pricing_type === 'weekend'
                  ? `Weekend · ${(r.days_of_week || []).map((d) => WEEKDAY_LABELS[d]).join(', ')}`
                  : `${r.pricing_type} · ${r.start_date?.slice?.(0, 10) || r.start_date} → ${r.end_date?.slice?.(0, 10) || r.end_date}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{currency} {r.price}</strong>
              <button className="btn-secondary" onClick={async () => { await staysApi.deletePricingRule(propertyId, r.id); load(); }}>Delete</button>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Name</label>
            <input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="e.g. December Peak" />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Type</label>
            <select value={ruleForm.pricing_type} onChange={(e) => setRuleForm({ ...ruleForm, pricing_type: e.target.value })}>
              <option value="seasonal">Seasonal</option>
              <option value="holiday">Holiday</option>
              <option value="weekend">Weekend</option>
            </select>
          </div>
          {ruleForm.pricing_type === 'weekend' ? (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Days</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {WEEKDAY_LABELS.map((d, i) => (
                  <button
                    key={d} type="button"
                    onClick={() => toggleDow(i)}
                    className="btn-secondary"
                    style={{ padding: '4px 6px', background: ruleForm.days_of_week.includes(i) ? '#1E293B' : undefined, color: ruleForm.days_of_week.includes(i) ? '#fff' : undefined }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Start</label>
                <input type="date" value={ruleForm.start_date} onChange={(e) => setRuleForm({ ...ruleForm, start_date: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>End</label>
                <input type="date" value={ruleForm.end_date} onChange={(e) => setRuleForm({ ...ruleForm, end_date: e.target.value })} />
              </div>
            </>
          )}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Price / night</label>
            <input type="number" min="0" value={ruleForm.price} onChange={(e) => setRuleForm({ ...ruleForm, price: e.target.value })} style={{ width: 100 }} />
          </div>
          <button className="btn-primary" onClick={addRule}>Add Rule</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SPECIAL OFFERS TAB
// ============================================================
function OffersTab({ propertyId, currency }) {
  const [offers, setOffers] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', discount_percent: '', start_date: '', end_date: '' });
  const [error, setError] = useState('');

  const load = () => staysApi.listOffers(propertyId).then(({ data }) => setOffers(data.offers || []));
  useEffect(() => { load(); }, [propertyId]);

  const addOffer = async () => {
    if (!form.title || !form.discount_percent || !form.start_date || !form.end_date) return;
    try {
      await staysApi.createOffer(propertyId, { ...form, discount_percent: Number(form.discount_percent) });
      setForm({ title: '', description: '', discount_percent: '', start_date: '', end_date: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create offer.');
    }
  };

  return (
    <div className="card-surface" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Special Offers</h3>
      {error && <div className="apf-error-text">{error}</div>}
      {offers.length === 0 && <div className="empty-state">No active offers.</div>}
      {offers.map((o) => (
        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EDEFEC', padding: '8px 0' }}>
          <div>
            <strong>{o.title}</strong> — {o.discount_percent}% off
            <div style={{ fontSize: '0.75rem', color: '#8A9189' }}>{o.start_date?.slice?.(0, 10)} → {o.end_date?.slice?.(0, 10)}</div>
          </div>
          <button className="btn-secondary" onClick={async () => { await staysApi.deleteOffer(propertyId, o.id); load(); }}>Delete</button>
        </div>
      ))}

      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Early Bird" />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Discount %</label>
          <input type="number" min="1" max="100" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} style={{ width: 90 }} />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>Start</label>
          <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}>End</label>
          <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={addOffer}>Add Offer</button>
      </div>
    </div>
  );
}
