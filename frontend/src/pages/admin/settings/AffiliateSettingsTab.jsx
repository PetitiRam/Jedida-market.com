import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

export default function AffiliateSettingsTab() {
  const [form, setForm] = useState(null);
  const [methodsText, setMethodsText] = useState('');
  const { saving, message, run } = useSaveState();

  const load = async () => {
    const { data } = await api.getSection('affiliate');
    setForm(data.value);
    setMethodsText((data.value.withdrawalMethods || []).map((m) => m.name).join(', '));
  };
  useEffect(() => { load(); }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: Number(e.target.value) });
  const setToggle = (key) => (val) => setForm({ ...form, [key]: val });

  const save = (e) => {
    e.preventDefault();
    const withdrawalMethods = methodsText.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name
    }));
    run(() => api.updateSection('affiliate', { ...form, withdrawalMethods }));
  };

  if (!form) return <div className="empty-state">Loading affiliate program settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Affiliate / Referral Program" description="Commission rates, withdrawal rules, and anti-fraud thresholds for referral earnings.">
        <form onSubmit={save}>
          <Toggle checked={form.affiliateProgramEnabled} onChange={setToggle('affiliateProgramEnabled')} label="Enable the affiliate program" />
          <div className="field-row">
            <div className="field-group">
              <label>Upgrade commission (%)</label>
              <input type="number" step="0.1" value={form.upgradeCommissionPercent} onChange={set('upgradeCommissionPercent')} />
            </div>
            <div className="field-group">
              <label>Sales commission (%)</label>
              <input type="number" step="0.1" value={form.salesCommissionPercent} onChange={set('salesCommissionPercent')} />
            </div>
          </div>
          <div className="field-row">
            <div className="field-group">
              <label>Minimum withdrawal</label>
              <input type="number" value={form.minimumWithdrawal} onChange={set('minimumWithdrawal')} />
            </div>
          </div>
          <div className="field-group">
            <label>Withdrawal methods (comma-separated)</label>
            <input type="text" value={methodsText} onChange={(e) => setMethodsText(e.target.value)} placeholder="Mobile Money, Bank Transfer" />
          </div>
          <Toggle checked={form.selfReferralBlocked} onChange={setToggle('selfReferralBlocked')} label="Block self-referrals (matching phone/email)" />
          <div className="field-row">
            <div className="field-group">
              <label>Max referrals per device/IP per day</label>
              <input type="number" value={form.maxReferralsPerDeviceOrIpPerDay} onChange={set('maxReferralsPerDeviceOrIpPerDay')} />
            </div>
            <div className="field-group">
              <label>Hold commissions after (per referrer, per day)</label>
              <input type="number" value={form.maxCommissionsPerDayBeforeHold} onChange={set('maxCommissionsPerDayBeforeHold')} />
            </div>
          </div>
          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save affiliate settings'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
