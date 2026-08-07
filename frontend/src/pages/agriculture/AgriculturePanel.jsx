import { useEffect, useState } from 'react';
import * as agricultureApi from '../../api/agricultureApi';
import client from '../../api/client';

/**
 * Agriculture tab inside SellerDashboard — the farmer/supplier/manufacturer
 * side of schema_phase45: seasonal availability, harvest calendar, farm-
 * level certifications, and supply contracts. Production capacity and
 * factory/warehouse address already live in the Business Profile tab;
 * wholesale pricing tiers, certificates, quote requests, and analytics
 * already have their own tabs — this doesn't repeat any of them.
 */
export default function AgriculturePanel() {
  const [profile, setProfile] = useState({ seasonalAvailability: [], harvestCalendar: [], certifications: [] });
  const [contracts, setContracts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [certName, setCertName] = useState('');
  const [cropName, setCropName] = useState('');

  const load = async () => {
    try {
      const { data: meData } = await client.get('/auth/me').catch(() => ({ data: null }));
      const userId = meData?.user?.id;
      if (userId) {
        const { data } = await agricultureApi.getFarmProfile(userId).catch(() => ({ data: { profile: null } }));
        if (data.profile) {
          setProfile({
            seasonalAvailability: data.profile.seasonal_availability || [],
            harvestCalendar: data.profile.harvest_calendar || [],
            certifications: data.profile.certifications || [],
          });
        }
      }
      const { data: cData } = await agricultureApi.myContracts();
      setContracts(cData.contracts || []);
    } catch (err) {
      setError('Could not load your agriculture data.');
    }
  };

  useEffect(() => { load(); }, []);

  const saveProfile = async (next) => {
    setSaving(true);
    setError('');
    try {
      await agricultureApi.updateMyFarmProfile(next || profile);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your farm profile.');
    } finally {
      setSaving(false);
    }
  };

  const addCertification = () => {
    if (!certName.trim()) return;
    const next = { ...profile, certifications: [...profile.certifications, { name: certName.trim() }] };
    setProfile(next);
    setCertName('');
    saveProfile(next);
  };

  const addSeasonalCrop = () => {
    if (!cropName.trim()) return;
    const next = { ...profile, seasonalAvailability: [...profile.seasonalAvailability, { product: cropName.trim(), months: [] }] };
    setProfile(next);
    setCropName('');
    saveProfile(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && <div className="apf-error-text">{error}</div>}

      <section className="card-surface" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Farm Profile</h3>
        <p style={{ color: '#5B6760', fontSize: '0.85rem', marginBottom: 12 }}>
          Production capacity and your farm's address are set under Business Profile. This covers
          what's specific to agriculture: seasonal availability and certifications.
        </p>

        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Seasonal availability</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {profile.seasonalAvailability.map((s, i) => (
            <span key={i} style={{ fontSize: '0.76rem', background: '#EEF4EF', padding: '3px 9px', borderRadius: 999 }}>{s.product}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={cropName} onChange={(e) => setCropName(e.target.value)} placeholder="e.g. Maize" style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={addSeasonalCrop} disabled={saving}>Add</button>
        </div>

        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Certifications</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {profile.certifications.map((c, i) => (
            <span key={i} style={{ fontSize: '0.76rem', background: '#EEF4EF', padding: '3px 9px', borderRadius: 999 }}>{c.name}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="e.g. Organic" style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={addCertification} disabled={saving}>Add</button>
        </div>
      </section>

      <section className="card-surface" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Supply Contracts</h3>
        <p style={{ color: '#5B6760', fontSize: '0.85rem', marginBottom: 12 }}>
          Repeat-purchase agreements. One-off bulk quotes are handled in the Quote Requests tab.
        </p>
        {contracts.length === 0 && <div className="empty-state">No active supply contracts.</div>}
        {contracts.map((c) => (
          <div key={c.id} style={{ borderBottom: '1px solid #EDEFEC', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{c.quantity_per_cycle} {c.unit} / {c.cycle}</strong>
              <span style={{ fontSize: '0.75rem', color: '#8A9189' }}>{c.status}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5B6760' }}>
              {c.buyer_username} ↔ {c.supplier_username} · {c.unit_price}/{c.unit} · next {c.next_delivery_date}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
