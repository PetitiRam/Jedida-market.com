import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

export default function CommissionSettingsTab() {
  const [form, setForm] = useState(null);
  const { saving, message, run } = useSaveState();

  const load = async () => { const { data } = await api.getSection('commission'); setForm(data.value); };
  useEffect(() => { load(); }, []);

  const save = (e) => { e.preventDefault(); run(() => api.updateSection('commission', form)); };
  const set = (key) => (e) => setForm({ ...form, [key]: Number(e.target.value) });
  const setToggle = (key) => (val) => setForm({ ...form, [key]: val });

  if (!form) return <div className="empty-state">Loading commission settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Commissions & Fees" description="Platform revenue and withdrawal limits.">
        <form onSubmit={save}>
          <div className="field-row">
            <div className="field-group"><label>Seller commission (%)</label><input type="number" step="0.1" value={form.sellerCommissionPercent} 
onChange={set('sellerCommissionPercent')} /></div>
            <div className="field-group"><label>Delivery commission (%)</label><input type="number" step="0.1" value={form.deliveryCommissionPercent} 
onChange={set('deliveryCommissionPercent')} /></div>
          </div>
          <div className="field-row">
            <div className="field-group"><label>Platform fee (%)</label><input type="number" step="0.1" value={form.platformFeePercent} 
onChange={set('platformFeePercent')} /></div>
            <div className="field-group"><label>VAT (%)</label><input type="number" step="0.1" value={form.vatPercent} onChange={set('vatPercent')} /></div>
            <div className="field-group"><label>Wholesale commission (%)</label><input type="number" step="0.1" value={form.wholesaleCommissionPercent || 0}
onChange={set('wholesaleCommissionPercent')} /></div>
          </div>
          <div className="field-row">
            <div className="field-group"><label>Withdrawal fee</label><input type="number" value={form.withdrawalFeeAmount} onChange={set('withdrawalFeeAmount')} 
/></div>
            <div className="field-group"><label>Minimum withdrawal</label><input type="number" value={form.minimumWithdrawal} onChange={set('minimumWithdrawal')} 
/></div>
            <div className="field-group"><label>Maximum withdrawal</label><input type="number" value={form.maximumWithdrawal} onChange={set('maximumWithdrawal')} 
/></div>
          </div>
          <Toggle checked={form.taxesEnabled} onChange={setToggle('taxesEnabled')} label="Enable tax calculation on orders" />
          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save commission settings'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
