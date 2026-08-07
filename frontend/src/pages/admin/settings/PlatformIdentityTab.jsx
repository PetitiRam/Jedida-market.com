import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, ImageFieldPreview } from '../settingsCenterUI';
import MediaUploader from '../../../components/MediaUploader';

const LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'sw', label: 'Swahili' },
  { value: 'fr', label: 'French' }, { value: 'lg', label: 'Luganda' }
];
const CURRENCIES = ['UGX', 'KES', 'TZS', 'NGN', 'GHS', 'ZAR', 'USD'];
const TIMEZONES = ['Africa/Kampala', 'Africa/Nairobi', 'Africa/Lagos', 'Africa/Johannesburg', 'UTC'];

const BRANDING_FIELDS = [
  { key: 'logoUrl', label: 'Marketplace Logo', hint: 'Shown in every page header' },
  { key: 'faviconUrl', label: 'Favicon', hint: 'Browser tab icon' },
  { key: 'appIconUrl', label: 'App Icon', hint: 'Mobile app home screen icon' },
  { key: 'splashScreenUrl', label: 'Splash Screen', hint: 'Mobile app launch screen' },
  { key: 'footerLogoUrl', label: 'Footer Logo', hint: 'Shown in the site footer' },
  { key: 'socialShareImageUrl', label: 'Social Sharing Image', hint: 'Preview image when links are shared' }
];

export default function PlatformIdentityTab() {
  const [settings, setSettings] = useState(null);
  const [identity, setIdentity] = useState({});
  const [branding, setBranding] = useState({});
  const { saving, message, run } = useSaveState();

  const load = async () => {
    const { data } = await api.getAllSettings();
    setSettings(data.settings);
    setIdentity({
      marketplaceName: data.settings.marketplace_name || '',
      supportEmail: data.settings.support_email || '',
      supportPhone: data.settings.support_phone || '',
      businessAddress: data.settings.business_address || '',
      country: data.settings.country || '',
      defaultLanguage: data.settings.default_language || 'en',
      defaultCurrency: data.settings.default_currency || 'UGX',
      defaultTimezone: data.settings.default_timezone || 'Africa/Kampala'
    });
    setBranding({
      logoUrl: data.settings.logo_url, faviconUrl: data.settings.favicon_url,
      appIconUrl: data.settings.app_icon_url, splashScreenUrl: data.settings.splash_screen_url,
      footerLogoUrl: data.settings.footer_logo_url, socialShareImageUrl: data.settings.social_share_image_url
    });
  };
  useEffect(() => { load(); }, []);

  const saveIdentity = (e) => {
    e.preventDefault();
    run(() => api.updateIdentity(identity));
  };

  const setBrandingField = async (key, url) => {
    setBranding((b) => ({ ...b, [key]: url }));
    await run(() => api.updateBranding({ [key]: url }));
  };

  if (!settings) return <div className="empty-state">Loading platform settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />

      <SectionCard title="Platform Identity" description="Basic information shown to buyers, sellers, and support channels.">
        <form onSubmit={saveIdentity}>
          <div className="field-group">
            <label>Marketplace name</label>
            <input value={identity.marketplaceName} onChange={(e) => setIdentity({ ...identity, marketplaceName: e.target.value })} required />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Support email</label>
              <input type="email" value={identity.supportEmail} onChange={(e) => setIdentity({ ...identity, supportEmail: e.target.value })} />
            </div>
            <div className="field-group">
              <label>Support phone</label>
              <input value={identity.supportPhone} onChange={(e) => setIdentity({ ...identity, supportPhone: e.target.value })} placeholder="+256700000000" />
            </div>
          </div>
          <div className="field-group">
            <label>Business address</label>
            <textarea rows={2} value={identity.businessAddress} onChange={(e) => setIdentity({ ...identity, businessAddress: e.target.value })} />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Country</label>
              <input value={identity.country} onChange={(e) => setIdentity({ ...identity, country: e.target.value })} placeholder="Uganda" />
            </div>
            <div className="field-group">
              <label>Default language</label>
              <select value={identity.defaultLanguage} onChange={(e) => setIdentity({ ...identity, defaultLanguage: e.target.value })}>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Default currency</label>
              <select value={identity.defaultCurrency} onChange={(e) => setIdentity({ ...identity, defaultCurrency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>Default time zone</label>
              <select value={identity.defaultTimezone} onChange={(e) => setIdentity({ ...identity, defaultTimezone: e.target.value })}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save platform identity'}</button>
        </form>
      </SectionCard>

      <SectionCard title="Branding" description="Upload real images — every field here is a direct upload, never a pasted URL.">
        {BRANDING_FIELDS.map((f) => (
          <div key={f.key} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--line)' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.label}</label>
            <p className="product-card-meta" style={{ marginBottom: 8 }}>{f.hint}</p>
            <MediaUploader label={`Upload ${f.label}`} accept="image/*" onUploaded={(m) => setBrandingField(f.key, m.url)} />
            <ImageFieldPreview url={branding[f.key]} label={f.label} onDelete={() => setBrandingField(f.key, null)} />
          </div>
        ))}
      </SectionCard>
    </div>
  );
}
