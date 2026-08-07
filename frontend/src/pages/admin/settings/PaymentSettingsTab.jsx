import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

export default function PaymentSettingsTab() {
  const [form, setForm] = useState(null);
  const { saving, message, run } = useSaveState();

  const load = async () => { const { data } = await api.getSection('payment'); setForm(data.value); };
  useEffect(() => { load(); }, []);

  const save = (e) => { e.preventDefault(); run(() => api.updateSection('payment', form)); };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setToggle = (key) => (val) => setForm({ ...form, [key]: val });

  if (!form) return <div className="empty-state">Loading payment settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Payment Settings" description="Where buyers/sellers send and receive money, and which methods are accepted.">
        <form onSubmit={save}>
          <div className="field-row">
            <div className="field-group"><label>Mobile money number</label><input value={form.mobileMoneyNumber} onChange={set('mobileMoneyNumber')} /></div>
            <div className="field-group"><label>Alternative mobile number</label><input value={form.alternativeMobileNumber} onChange={set('alternativeMobileNumber')} 
/></div>
          </div>
          <div className="field-row">
            <div className="field-group"><label>Bank name</label><input value={form.bankName} onChange={set('bankName')} /></div>
            <div className="field-group"><label>Bank account number</label><input value={form.bankAccount} onChange={set('bankAccount')} /></div>
          </div>
          <div className="field-group"><label>Account name</label><input value={form.accountName} onChange={set('accountName')} /></div>
          <div className="field-group">
            <label>Payment instructions</label>
            <textarea rows={3} value={form.paymentInstructions} onChange={set('paymentInstructions')} />
          </div>

          <div style={{ marginTop: 10 }}>
            <Toggle checked={form.enableMobileMoney} onChange={setToggle('enableMobileMoney')} label="Enable mobile money" />
            <Toggle checked={form.enableBankTransfer} onChange={setToggle('enableBankTransfer')} label="Enable bank transfer" />
            <Toggle checked={form.enableCash} onChange={setToggle('enableCash')} label="Enable cash on delivery" />
            <Toggle checked={form.enableCardPayments} onChange={setToggle('enableCardPayments')} label="Enable card payments" />
          </div>

          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save payment settings'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
