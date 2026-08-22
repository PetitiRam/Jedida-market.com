import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import MarketplaceHeader from '../../components/MarketplaceHeader';
import * as hubApi from '../../api/chinaTradeHubApi';

const STOCK_LABELS = { in_stock: 'In stock', limited_stock: 'Limited stock', made_to_order: 'Made to order', out_of_stock: 'Out of stock' };

function InspectionForm({ businessProfileId, onDone }) {
  const [productDescription, setProductDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!productDescription.trim()) return;
    setBusy(true);
    setError('');
    try {
      await hubApi.requestInspection({ businessProfileId, productDescription: productDescription.trim(), quantity: quantity ? Number(quantity) : undefined });
      setOpen(false);
      setProductDescription('');
      setQuantity('');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not request inspection.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>Request Inspection</button>;

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginTop: 8 }}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field-group">
        <label>What should be inspected?</label>
        <textarea rows={3} value={productDescription} onChange={(e) => setProductDescription(e.target.value)} />
      </div>
      <div className="field-group">
        <label>Quantity (optional)</label>
        <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</button>
        <button type="button" className="btn-link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export default function SupplierTradeProfile() {
  const { businessProfileId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requested, setRequested] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await hubApi.getSupplierTradeProfile(businessProfileId);
      setData(data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [businessProfileId]);

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!data) return <div className="empty-state">Supplier not found.</div>;

  const { profile, capabilities, africaReadyBadge } = data;

  return (
    <div>
      <MarketplaceHeader />
      <div className="dash-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ marginBottom: 4 }}>{profile.company_name}</h2>
          {africaReadyBadge && <span className="product-card-badge" style={{ background: '#0B3D24', color: '#fff' }}>🌍 Jedida Africa Ready</span>}
        </div>
        <p className="product-card-meta">{profile.company_country} · {profile.business_type}</p>
        {profile.description && <p style={{ margin: '12px 0' }}>{profile.description}</p>}

        <div className="card-surface" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Production & Trade</h3>
          <ul style={{ paddingLeft: 18, fontSize: '0.9rem', lineHeight: 1.8 }}>
            {profile.production_capacity && <li>Production capacity: {profile.production_capacity}</li>}
            {profile.stock_availability && <li>Stock: {STOCK_LABELS[profile.stock_availability] || profile.stock_availability}</li>}
            {capabilities?.moq && <li>MOQ: {capabilities.moq}</li>}
            {capabilities?.lead_time_days != null && <li>Lead time: {capabilities.lead_time_days} days</li>}
            {capabilities?.shipping_port && <li>Shipping port: {capabilities.shipping_port}</li>}
            {capabilities?.export_experience_years != null && <li>Export experience: {capabilities.export_experience_years} years</li>}
            {capabilities?.african_markets_served?.length > 0 && <li>Markets served: {capabilities.african_markets_served.join(', ')}</li>}
            {capabilities?.certifications?.length > 0 && <li>Certifications: {capabilities.certifications.join(', ')}</li>}
            {[
              capabilities?.oem_available && 'OEM', capabilities?.odm_available && 'ODM',
              capabilities?.private_label_available && 'Private label', capabilities?.sample_available && 'Samples available',
              capabilities?.packaging_customization && 'Custom packaging'
            ].filter(Boolean).length > 0 && (
              <li>Offers: {[
                capabilities?.oem_available && 'OEM', capabilities?.odm_available && 'ODM',
                capabilities?.private_label_available && 'Private label', capabilities?.sample_available && 'Samples available',
                capabilities?.packaging_customization && 'Custom packaging'
              ].filter(Boolean).join(', ')}</li>
            )}
          </ul>
          {!capabilities && <p className="empty-state">This supplier hasn't added trade details yet.</p>}
        </div>

        <div className="card-surface">
          <h3 style={{ marginTop: 0 }}>Vet before you commit</h3>
          <p className="product-card-meta" style={{ marginBottom: 12 }}>Request a Jedida inspection before placing a large order.</p>
          {requested
            ? <div className="alert">Inspection requested — track it from your account.</div>
            : <InspectionForm businessProfileId={profile.id} onDone={() => setRequested(true)} />}
        </div>
      </div>
    </div>
  );
}
