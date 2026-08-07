import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState } from '../settingsCenterUI';

export default function MarketplaceRulesTab() {
  const [form, setForm] = useState(null);
  const { saving, message, run } = useSaveState();

  const load = async () => { const { data } = await api.getSection('marketplaceRules'); setForm(data.value); };
  useEffect(() => { load(); }, []);

  const save = (e) => { e.preventDefault(); run(() => api.updateSection('marketplaceRules', form)); };
  const set = (key) => (e) => setForm({ ...form, [key]: Number(e.target.value) });

  if (!form) return <div className="empty-state">Loading marketplace rules…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Marketplace Rules" description="Operational thresholds for bulk orders and disputes — tunable without a deploy.">
        <form onSubmit={save}>
          <div className="field-row">
            <div className="field-group">
              <label>Minimum purchase agreement amount</label>
              <input type="number" value={form.minPurchaseAgreementAmount || 0} onChange={set('minPurchaseAgreementAmount')} />
            </div>
            <div className="field-group">
              <label>Require agreement above amount</label>
              <input type="number" value={form.requirePurchaseAgreementAboveAmount || 0} onChange={set('requirePurchaseAgreementAboveAmount')} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Dispute window (days)</label>
              <input type="number" value={form.disputeWindowDays || 0} onChange={set('disputeWindowDays')} />
            </div>
            <div className="field-group">
              <label>RFQ expiry (days)</label>
              <input type="number" value={form.rfqExpiryDays || 0} onChange={set('rfqExpiryDays')} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Bulk order minimum units</label>
              <input type="number" value={form.bulkOrderMinimumUnits || 0} onChange={set('bulkOrderMinimumUnits')} />
            </div>
            <div className="field-group">
              <label>Max open disputes before auto-suspension review</label>
              <input type="number" value={form.maxOpenDisputesBeforeSuspension || 0} onChange={set('maxOpenDisputesBeforeSuspension')} />
            </div>
          </div>
          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save marketplace rules'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
