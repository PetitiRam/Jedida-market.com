import { useEffect, useState } from 'react';
import { getFarmProfile } from '../../api/agricultureApi';

/**
 * FarmProfileCard — the "professional agriculture storefront" surface
 * for a farmer/supplier/manufacturer's business_profiles + farm_profiles
 * record (schema_phase45). Read-only display; production capacity and
 * factory/warehouse address are edited via the existing Business Profile
 * tab (b2bApi.updateMyBusinessProfile); seasonal availability, harvest
 * calendar, and farm-level certifications are edited in AgriculturePanel
 * (PATCH /agriculture/farms/me).
 */
export default function FarmProfileCard({ userId }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    getFarmProfile(userId)
      .then(({ data }) => setProfile(data.profile))
      .catch(() => setError('Could not load this farm profile.'));
  }, [userId]);

  if (error) return <div style={{ color: '#8A9189', fontSize: '0.85rem' }}>{error}</div>;
  if (!profile) return null;

  const reliabilityColor = profile.trustScore >= 90 ? 'var(--amber-dark)' : profile.trustScore >= 70 ? '#B07C1F' : '#B23A2E';

  return (
    <div style={{
      background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 18,
      padding: 20, boxShadow: 'var(--shadow-soft)', maxWidth: 420, fontFamily: 'var(--font-body)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--ink)' }}>
          {profile.company_name}
        </span>
        {profile.verified && (
          <span style={{
            fontSize: '0.68rem', fontWeight: 700, color: 'var(--forest)',
            background: 'rgba(11,61,36,0.08)', padding: '3px 9px', borderRadius: 999,
          }}>
            ✓ Verified {profile.business_type}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: `conic-gradient(${reliabilityColor} ${profile.trustScore * 3.6}deg, var(--line) 0)`,
        }} />
        <span style={{ fontSize: '0.78rem', color: '#5B6760', fontWeight: 600 }}>
          Supply reliability {profile.trustScore}%
        </span>
      </div>

      {profile.production_capacity && (
        <Row label="Production capacity" value={profile.production_capacity} />
      )}

      {profile.seasonal_availability?.length > 0 && (
        <Section title="Seasonal availability">
          {profile.seasonal_availability.map((s, i) => (
            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--ink)', padding: '3px 0' }}>
              {s.product} — {(s.months || []).length} month{(s.months || []).length === 1 ? '' : 's'}/yr
            </div>
          ))}
        </Section>
      )}

      {profile.harvest_calendar?.length > 0 && (
        <Section title="Harvest calendar">
          {profile.harvest_calendar.map((h, i) => (
            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--ink)', padding: '3px 0' }}>
              {h.crop}: plant month {h.plant_month} → harvest month {h.harvest_month}
            </div>
          ))}
        </Section>
      )}

      {profile.certifications?.length > 0 && (
        <Section title="Certifications">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {profile.certifications.map((c, i) => (
              <span key={i} style={{
                fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest)',
                background: 'rgba(139,197,63,0.16)', border: '1px solid rgba(139,197,63,0.4)',
                padding: '3px 9px', borderRadius: 999,
              }}>
                {c.name}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#5B6760', padding: '4px 0' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#8A9189', marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
