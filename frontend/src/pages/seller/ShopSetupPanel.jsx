import { useEffect, useState } from 'react';
import client from '../../api/client';
import { CATEGORIES } from '../../constants/categories';
import MediaUploader from '../../components/MediaUploader';

export default function ShopSetupPanel() {
  const [shop, setShop] = useState(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    primaryCategory: 'other',
    currency: 'USD',
    logoUrl: ''
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/shops/me');
      setShop(data.shop);

      if (data.shop) {
        setForm({
          name: data.shop.name,
          description: data.shop.description || '',
          primaryCategory: data.shop.primary_category,
          currency: data.shop.currency,
          logoUrl: data.shop.logo_url || ''
        });
      }
    } catch {
      setShop(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = (key) => (e) =>
    setForm({ ...form, [key]: e.target.value });

  const setLogo = (file) => {
    setForm({ ...form, logoUrl: file.url });
  };

  const createShop = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const { data } = await client.post('/shops', form);
      setShop(data.shop);
      setMessage(data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create your shop.');
    } finally {
      setBusy(false);
    }
  };

  const saveShop = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const { data } = await client.patch('/shops/me', form);
      setShop(data.shop);
      setMessage('Shop details saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shop.share_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="empty-state">Loading your shop…</div>;

  return (
    <div className="card-surface">

      {/* CREATE SHOP */}
      {!shop ? (
        <>
          <h3>Open your shop</h3>
          <p style={{ color: '#5B6760' }}>
            Create your shop profile, logo, and shareable link.
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={createShop}>

            {/* LOGO UPLOAD ⭐ NEW */}
            <div className="field-group">
              <label>Shop logo</label>

              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Shop logo"
                  style={{
                    width: 80,
                    height: 80,
                    objectFit: 'cover',
                    borderRadius: '50%',
                    marginBottom: 10
                  }}
                />
              )}

              <MediaUploader
                label="Upload logo"
                accept="image/*"
                onUploaded={setLogo}
              />
            </div>

            <div className="field-group">
              <label>Shop name</label>
              <input
                value={form.name}
                onChange={update('name')}
                required
              />
            </div>

            <div className="field-group">
              <label>Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={update('description')}
              />
            </div>

            <div className="field-row">
              <div className="field-group">
                <label>Primary category</label>
                <select
                  value={form.primaryCategory}
                  onChange={update('primaryCategory')}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label>Currency</label>
                <select
                  value={form.currency}
                  onChange={update('currency')}
                >
                  <option value="USD">USD</option>
                  <option value="UGX">UGX</option>
                  <option value="KES">KES</option>
                  <option value="NGN">NGN</option>
                </select>
              </div>
            </div>

            <button className="btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create shop'}
            </button>
          </form>
        </>
      ) : (
        <>
          <h3>{shop.name}</h3>

          {shop.logo_url && (
            <img
              src={shop.logo_url}
              alt="Shop logo"
              style={{
                width: 90,
                height: 90,
                borderRadius: '50%',
                objectFit: 'cover',
                marginTop: 10
              }}
            />
          )}

          <span className={`status-chip status-${shop.status}`}>
            {shop.status}
          </span>

          {message && <div className="alert alert-success">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          {/* SHARE INFO */}
          <div style={{ marginTop: 16 }}>
            <strong>Shareable link:</strong>{' '}
            <a href={shop.share_link} target="_blank" rel="noreferrer">
              {shop.share_link}
            </a>
          </div>

          {/* EDIT FORM */}
          <form onSubmit={saveShop}>

            {/* LOGO UPDATE ⭐ NEW */}
            <div className="field-group">
              <label>Update logo</label>

              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Logo"
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    marginBottom: 10
                  }}
                />
              )}

              <MediaUploader
                label="Change logo"
                accept="image/*"
                onUploaded={setLogo}
              />
            </div>

            <div className="field-group">
              <label>Shop name</label>
              <input
                value={form.name}
                onChange={update('name')}
              />
            </div>

            <div className="field-group">
              <label>Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={update('description')}
              />
            </div>

            <button className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
