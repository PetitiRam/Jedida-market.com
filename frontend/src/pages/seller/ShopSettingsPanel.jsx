import { useEffect, useState } from 'react';
import client from '../../api/client';
import * as shopApi from '../../api/shopApi';
import MediaUploader from '../../components/MediaUploader';

const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'x'];

export default function ShopSettingsPanel() {
  const [shop, setShop] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await client.get('/shops/me');
    setShop(data.shop);
    setForm({
      slug: data.shop.slug,
      coverImageUrl: data.shop.cover_image_url || '',
      contactEmail: data.shop.contact_email || '',
      contactPhone: data.shop.contact_phone || '',
      socialLinks: { facebook: '', instagram: '', tiktok: '', whatsapp: '', x: '', ...(data.shop.social_links || {}) },
      themePrimaryColor: data.shop.theme_primary_color || '#0B3D24',
      themeAccentColor: data.shop.theme_accent_color || '#8BC53F',
      returnPolicy: data.shop.return_policy || '',
      shippingPolicy: data.shop.shipping_policy || '',
      termsContent: data.shop.terms_content || ''
    });
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await shopApi.updateShopSettings(form);
      setShop(data.shop);
      setMessage(data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save shop settings.');
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <div className="empty-state">Loading shop settings…</div>;

  return (
    <div className="card-surface">
      <h3>Shop Settings</h3>
      <p className="product-card-meta" style={{ marginBottom: 16 }}>Changes here reflect on your public shop page immediately.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form onSubmit={save}>
        <div className="field-group">
          <label>Shop URL (jedida.app/s/...)</label>
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
        </div>

        <div className="field-group">
          <label>Cover / banner image</label>
          <MediaUploader label="Upload cover image" accept="image/*" onUploaded={(m) => setForm({ ...form, coverImageUrl: m.url })} />
          {form.coverImageUrl && <img src={form.coverImageUrl} alt="Cover preview" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, 
marginTop: 8 }} />}
        </div>

        <div className="field-row">
          <div className="field-group"><label>Contact email</label><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: 
e.target.value })} /></div>
          <div className="field-group"><label>Contact phone</label><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} 
/></div>
        </div>

        <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 8 }}>Social media links</label>
        <div className="field-row" style={{ flexWrap: 'wrap' }}>
          {SOCIAL_PLATFORMS.map((platform) => (
            <div className="field-group" key={platform} style={{ minWidth: 140 }}>
              <label style={{ textTransform: 'capitalize' }}>{platform}</label>
              <input
                value={form.socialLinks[platform]}
                onChange={(e) => setForm({ ...form, socialLinks: { ...form.socialLinks, [platform]: e.target.value } })}
                placeholder={`https://${platform}.com/yourshop`}
              />
            </div>
          ))}
        </div>

        <div className="field-row">
          <div className="field-group"><label>Theme primary color</label><input type="color" value={form.themePrimaryColor} onChange={(e) => setForm({ ...form, 
themePrimaryColor: e.target.value })} /></div>
          <div className="field-group"><label>Theme accent color</label><input type="color" value={form.themeAccentColor} onChange={(e) => setForm({ ...form, 
themeAccentColor: e.target.value })} /></div>
        </div>

        <div className="field-group"><label>Return policy</label><textarea rows={3} value={form.returnPolicy} onChange={(e) => setForm({ ...form, returnPolicy: 
e.target.value })} /></div>
        <div className="field-group"><label>Shipping policy</label><textarea rows={3} value={form.shippingPolicy} onChange={(e) => setForm({ ...form, shippingPolicy: 
e.target.value })} /></div>
        <div className="field-group"><label>Terms & conditions</label><textarea rows={3} value={form.termsContent} onChange={(e) => setForm({ ...form, termsContent: 
e.target.value })} /></div>

        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save shop settings'}</button>
      </form>
    </div>
  );
}
