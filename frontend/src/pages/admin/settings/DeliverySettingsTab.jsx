import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

export default function DeliverySettingsTab() {
  const [form, setForm] = useState(null);
  const { saving, message, run } = useSaveState();

  const load = async () => { const { data } = await api.getSection('delivery'); setForm(data.value); };
  useEffect(() => { load(); }, []);

  const save = (e) => { e.preventDefault(); run(() => api.updateSection('delivery', form)); };
  const set = (key, isNum) => (e) => setForm({ ...form, [key]: isNum ? Number(e.target.value) : e.target.value });
  const setToggle = (key) => (val) => setForm({ ...form, [key]: val });

  if (!form) return <div className="empty-state">Loading delivery settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Delivery Settings" description="Coverage area, fees, and working hours for delivery partners.">
        <form onSubmit={save}>
          <div className="field-row">
            <div className="field-group"><label>Delivery radius (km)</label><input type="number" value={form.deliveryRadiusKm} onChange={set('deliveryRadiusKm', true)} 
/></div>
            <div className="field-group"><label>Max delivery distance (km)</label><input type="number" value={form.maxDeliveryDistanceKm} 
onChange={set('maxDeliveryDistanceKm', true)} /></div>
            <div className="field-group"><label>Default delivery fee</label><input type="number" value={form.defaultDeliveryFee} onChange={set('defaultDeliveryFee', 
true)} /></div>
          </div>
          <div className="field-row">
            <div className="field-group"><label>Working hours — start</label><input type="time" value={form.workingHoursStart} onChange={set('workingHoursStart')} 
/></div>
            <div className="field-group"><label>Working hours — end</label><input type="time" value={form.workingHoursEnd} onChange={set('workingHoursEnd')} /></div>
          </div>
          <Toggle checked={form.allowDeliveryTracking} onChange={setToggle('allowDeliveryTracking')} label="Allow real-time delivery tracking" />
          <Toggle checked={form.requireDeliveryVerification} onChange={setToggle('requireDeliveryVerification')} label="Require KYC verification for delivery partners" 
/>
          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save delivery settings'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
