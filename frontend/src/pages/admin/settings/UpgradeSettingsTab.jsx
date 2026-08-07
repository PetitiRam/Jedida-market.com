import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

const emptyCountryRow = () => ({
  code: '', countryName: '', currency: '', sellerAmount: '', deliveryAmount: '', providersText: ''
});

// countryPricing is stored as { CODE: { countryName, currency, sellerAmount,
// deliveryAmount, providers: [{id,name}] } }. The editor works with a flat
// array of rows (providers joined as "Name|id, Name|id") and converts back
// to that object shape on save.
function pricingObjectToRows(pricing) {
  return Object.entries(pricing || {}).map(([code, entry]) => ({
    code,
    countryName: entry.countryName || '',
    currency: entry.currency || '',
    sellerAmount: entry.sellerAmount ?? '',
    deliveryAmount: entry.deliveryAmount ?? '',
    providersText: (entry.providers || []).map((p) => p.name).join(', ')
  }));
}

function rowsToPricingObject(rows) {
  const out = {};
  rows.forEach((row) => {
    const code = row.code.trim().toUpperCase();
    if (!code) return;
    out[code] = {
      countryName: row.countryName.trim() || code,
      currency: row.currency.trim().toUpperCase() || 'UGX',
      sellerAmount: Number(row.sellerAmount) || 0,
      deliveryAmount: Number(row.deliveryAmount) || 0,
      providers: row.providersText.split(',').map((s) => s.trim()).filter(Boolean)
        .map((name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name }))
    };
  });
  return out;
}

export default function UpgradeSettingsTab() {
  const [form, setForm] = useState(null);
  const [countryRows, setCountryRows] = useState([]);
  const { saving, message, run } = useSaveState();

  const load = async () => {
    const { data } = await api.getSection('sellerUpgrade');
    setForm(data.value);
    setCountryRows(pricingObjectToRows(data.value.countryPricing));
  };
  useEffect(() => { load(); }, []);

  const save = (e) => {
    e.preventDefault();
    const payload = { ...form, countryPricing: rowsToPricingObject(countryRows) };
    run(() => api.updateSection('sellerUpgrade', payload)).then(() => setForm(payload));
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setToggle = (key) => (val) => setForm({ ...form, [key]: val });

  const setRow = (idx, key) => (e) => {
    const next = [...countryRows];
    next[idx] = { ...next[idx], [key]: e.target.value };
    setCountryRows(next);
  };
  const addRow = () => setCountryRows([...countryRows, emptyCountryRow()]);
  const removeRow = (idx) => setCountryRows(countryRows.filter((_, i) => i !== idx));

  if (!form) return <div className="empty-state">Loading upgrade settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Seller & Delivery Upgrade Settings" description="Controls the fee, payment instructions, and required steps for buyers upgrading to seller or 
delivery.">
        <form onSubmit={save}>
          <div className="field-row">
            <div className="field-group">
              <label>Seller upgrade fee</label>
              <input type="number" min="0" value={form.sellerFeeAmount} onChange={set('sellerFeeAmount')} />
            </div>
            <div className="field-group">
              <label>Delivery upgrade fee</label>
              <input type="number" min="0" value={form.deliveryFeeAmount} onChange={set('deliveryFeeAmount')} />
            </div>
            <div className="field-group">
              <label>Currency</label>
              <input value={form.currency} onChange={set('currency')} />
            </div>
          </div>

          <div className="field-group">
            <label>Mobile money number</label>
            <input value={form.mobileMoneyNumber} onChange={set('mobileMoneyNumber')} />
          </div>

          <div className="field-group">
            <label>Payment instructions shown to applicants</label>
            <textarea rows={3} value={form.paymentInstructions} onChange={set('paymentInstructions')} />
          </div>

          <div style={{ marginTop: 10 }}>
            <Toggle checked={form.sellerUpgradesEnabled} onChange={setToggle('sellerUpgradesEnabled')} label="Enable seller upgrades" />
            <Toggle checked={form.deliveryUpgradesEnabled} onChange={setToggle('deliveryUpgradesEnabled')} label="Enable delivery upgrades" />
            <Toggle checked={form.requirePaymentBeforeKyc} onChange={setToggle('requirePaymentBeforeKyc')} label="Require payment before KYC" />
            <Toggle checked={form.requireKycBeforeApproval} onChange={setToggle('requireKycBeforeApproval')} label="Require KYC before approval" />
            <Toggle checked={form.allowAutomaticApproval} onChange={setToggle('allowAutomaticApproval')} label="Allow automatic approval (default OFF — recommended to 
keep off)" />
          </div>

          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save upgrade settings'}</button>
        </form>
      </SectionCard>

      <SectionCard
        title="Per-country pricing & mobile money providers"
        description="Sets the one-time upgrade amount and available mobile money providers shown on the Upgrade page for each country. Countries not listed here fall back to the flat fee above."
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: '0.8rem', color: '#5B6760' }}>
                <th style={{ padding: '6px 8px' }}>Code</th>
                <th style={{ padding: '6px 8px' }}>Country</th>
                <th style={{ padding: '6px 8px' }}>Currency</th>
                <th style={{ padding: '6px 8px' }}>Seller fee</th>
                <th style={{ padding: '6px 8px' }}>Delivery fee</th>
                <th style={{ padding: '6px 8px' }}>Providers (comma-separated)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {countryRows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ padding: 4 }}><input style={{ width: 56 }} value={row.code} onChange={setRow(idx, 'code')} placeholder="UG" /></td>
                  <td style={{ padding: 4 }}><input style={{ width: 120 }} value={row.countryName} onChange={setRow(idx, 'countryName')} placeholder="Uganda" /></td>
                  <td style={{ padding: 4 }}><input style={{ width: 70 }} value={row.currency} onChange={setRow(idx, 'currency')} placeholder="UGX" /></td>
                  <td style={{ padding: 4 }}><input type="number" min="0" style={{ width: 90 }} value={row.sellerAmount} onChange={setRow(idx, 'sellerAmount')} /></td>
                  <td style={{ padding: 4 }}><input type="number" min="0" style={{ width: 90 }} value={row.deliveryAmount} onChange={setRow(idx, 'deliveryAmount')} /></td>
                  <td style={{ padding: 4 }}><input style={{ width: 220 }} value={row.providersText} onChange={setRow(idx, 'providersText')} placeholder="MTN Mobile Money, Airtel Money" /></td>
                  <td style={{ padding: 4 }}><button type="button" className="btn-link" onClick={() => removeRow(idx)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-secondary" style={{ marginTop: 10 }} onClick={addRow}>+ Add country</button>
        <button type="button" className="btn-primary" disabled={saving} style={{ marginTop: 10, marginLeft: 10 }} onClick={save}>
          {saving ? 'Saving…' : 'Save country pricing'}
        </button>
      </SectionCard>
    </div>
  );
}
