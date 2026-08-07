import { useEffect, useState } from 'react';
import * as b2bApi from '../../api/b2bApi';
import Icon from '../../components/icons/icon';

const STOCK_OPTIONS = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'limited_stock', label: 'Limited stock' },
  { value: 'made_to_order', label: 'Made to order' },
  { value: 'out_of_stock', label: 'Out of stock' }
];

const STATUS_LABELS = {
  pending: 'Pending review',
  active: 'Verified',
  suspended: 'Suspended',
  rejected: 'Rejected'
};

export default function BusinessProfilePanel({ role }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ factoryAddress: '', warehouseAddress: '', productionCapacity: '', stockAvailability: 'in_stock' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await b2bApi.getMyBusinessProfile();
      setProfile(data.profile);
      setForm({
        factoryAddress: data.profile.factory_address || '',
        warehouseAddress: data.profile.warehouse_address || '',
        productionCapacity: data.profile.production_capacity || '',
        stockAvailability: data.profile.stock_availability || 'in_stock'
      });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await b2bApi.updateMyBusinessProfile(form);
      setProfile(data.profile);
      setNotice('Business profile updated.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not update business profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="empty-state">Loading business profile…</div>;
  if (!profile) return <div className="empty-state">No business profile found yet — this is created automatically once your upgrade is submitted.</div>;

  const isManufacturer = role === 'manufacturer';

  return (
    <div className="card-surface" style={{ maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon name={isManufacturer ? 'factory' : 'building'} size={20} color="var(--forest)" />
        <h3 style={{ margin: 0 }}>{profile.company_name}</h3>
      </div>
      <p className="product-card-meta" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={profile.status === 'active' ? 'checkShield' : 'clock'} size={14} />
        {STATUS_LABELS[profile.status] || profile.status}
      </p>

      {notice && <div className="alert alert-success">{notice}</div>}

      <form onSubmit={save}>
        {isManufacturer ? (
          <div className="field-group">
            <label>Factory address</label>
            <textarea rows={2} value={form.factoryAddress} onChange={(e) => setForm((f) => ({ ...f, factoryAddress: e.target.value }))} placeholder="Street, city, country" />
          </div>
        ) : (
          <div className="field-group">
            <label>Warehouse location</label>
            <textarea rows={2} value={form.warehouseAddress} onChange={(e) => setForm((f) => ({ ...f, warehouseAddress: e.target.value }))} placeholder="Street, city, country" />
          </div>
        )}

        {isManufacturer && (
          <div className="field-group">
            <label>Production capacity</label>
            <input value={form.productionCapacity} onChange={(e) => setForm((f) => ({ ...f, productionCapacity: e.target.value }))} placeholder="e.g. 50,000 units / month" />
          </div>
        )}

        <div className="field-group">
          <label>Stock availability</label>
          <select value={form.stockAvailability} onChange={(e) => setForm((f) => ({ ...f, stockAvailability: e.target.value }))}>
            {STOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save business profile'}</button>
      </form>
    </div>
  );
}
