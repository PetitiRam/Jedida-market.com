import { useEffect, useState } from 'react';
import * as hubApi from '../../api/chinaTradeHubApi';

const RESULT_LABELS = { passed: '✅ Passed', failed: '❌ Failed', needs_more_info: '⚠️ Needs more info' };
const STATUS_LABELS = { requested: 'Requested', scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

function CapabilitiesForm() {
  const [form, setForm] = useState({
    moq: '', leadTimeDays: '', oemAvailable: false, odmAvailable: false, privateLabelAvailable: false,
    sampleAvailable: false, packagingCustomization: false, exportExperienceYears: '',
    africanMarketsServed: '', shippingPort: '', certifications: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await hubApi.getMyTradeCapabilities();
      const c = data.capabilities;
      if (c) {
        setForm({
          moq: c.moq || '', leadTimeDays: c.lead_time_days || '',
          oemAvailable: c.oem_available, odmAvailable: c.odm_available, privateLabelAvailable: c.private_label_available,
          sampleAvailable: c.sample_available, packagingCustomization: c.packaging_customization,
          exportExperienceYears: c.export_experience_years || '',
          africanMarketsServed: (c.african_markets_served || []).join(', '),
          shippingPort: c.shipping_port || '', certifications: (c.certifications || []).join(', ')
        });
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      await hubApi.saveTradeCapabilities({
        moq: form.moq ? Number(form.moq) : undefined,
        leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
        oemAvailable: form.oemAvailable, odmAvailable: form.odmAvailable, privateLabelAvailable: form.privateLabelAvailable,
        sampleAvailable: form.sampleAvailable, packagingCustomization: form.packagingCustomization,
        exportExperienceYears: form.exportExperienceYears ? Number(form.exportExperienceYears) : undefined,
        africanMarketsServed: form.africanMarketsServed.split(',').map((s) => s.trim()).filter(Boolean),
        shippingPort: form.shippingPort || undefined,
        certifications: form.certifications.split(',').map((s) => s.trim()).filter(Boolean)
      });
      setNotice('Saved.');
    } catch (err) {
      setNotice(err.response?.data?.error || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <form onSubmit={save} className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Trade Capabilities</h3>
      {notice && <div className="alert">{notice}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 100 }}>
          <label>MOQ</label>
          <input type="number" min="0" value={form.moq} onChange={(e) => setForm({ ...form, moq: e.target.value })} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 100 }}>
          <label>Lead time (days)</label>
          <input type="number" min="0" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} />
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 100 }}>
          <label>Export experience (years)</label>
          <input type="number" min="0" value={form.exportExperienceYears} onChange={(e) => setForm({ ...form, exportExperienceYears: e.target.value })} />
        </div>
      </div>

      <div className="field-group">
        <label>Shipping port</label>
        <input value={form.shippingPort} onChange={(e) => setForm({ ...form, shippingPort: e.target.value })} placeholder="e.g. Guangzhou / Mombasa" />
      </div>
      <div className="field-group">
        <label>African markets served (comma-separated)</label>
        <input value={form.africanMarketsServed} onChange={(e) => setForm({ ...form, africanMarketsServed: e.target.value })} placeholder="Uganda, Kenya, Ghana" />
      </div>
      <div className="field-group">
        <label>Certifications (comma-separated)</label>
        <input value={form.certifications} onChange={(e) => setForm({ ...form, certifications: e.target.value })} placeholder="ISO9001, CE" />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0 12px' }}>
        {[
          ['oemAvailable', 'OEM available'], ['odmAvailable', 'ODM available'],
          ['privateLabelAvailable', 'Private label'], ['sampleAvailable', 'Samples available'],
          ['packagingCustomization', 'Custom packaging']
        ].map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>

      <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    </form>
  );
}

function FactoryVerificationStatus() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await hubApi.myFactoryVerifications();
      setRequests(data.requests || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const request = async () => {
    setBusy(true);
    try {
      await hubApi.requestFactoryVerification();
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not request verification.');
    } finally {
      setBusy(false);
    }
  };

  const hasActive = requests.some((r) => ['requested', 'scheduled', 'in_progress'].includes(r.status));

  return (
    <div className="card-surface">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Factory Verification</h3>
        {!hasActive && <button className="btn-primary" onClick={request} disabled={busy}>{busy ? 'Requesting…' : 'Request verification'}</button>}
      </div>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        A verified factory earns buyer trust — and can qualify for the Jedida Africa Ready badge.
      </p>

      {loading && <div className="empty-state">Loading…</div>}
      {!loading && requests.length === 0 && <div className="empty-state">No verification requests yet.</div>}
      {requests.map((r) => (
        <div key={r.id} className="card-surface" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>{new Date(r.created_at).toLocaleDateString()}</span>
            <span className="product-card-badge">{STATUS_LABELS[r.status] || r.status}</span>
          </div>
          {r.latest_report && (
            <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
              Result: {RESULT_LABELS[r.latest_report.overall_result] || r.latest_report.overall_result}
              {r.latest_report.summary && <p style={{ color: '#5B6760' }}>{r.latest_report.summary}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TradeCapabilitiesPanel() {
  return (
    <div>
      <CapabilitiesForm />
      <FactoryVerificationStatus />
    </div>
  );
}
