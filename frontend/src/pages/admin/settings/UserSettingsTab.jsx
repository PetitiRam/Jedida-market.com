import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

export default function UserSettingsTab() {
  const [form, setForm] = useState(null);
  const { saving, message, run } = useSaveState();

  const load = async () => { const { data } = await api.getSection('user'); setForm(data.value); };
  useEffect(() => { load(); }, []);

  const save = (e) => { e.preventDefault(); run(() => api.updateSection('user', form)); };
  const set = (key, isNum) => (e) => setForm({ ...form, [key]: isNum ? Number(e.target.value) : e.target.value });
  const setToggle = (key) => (val) => setForm({ ...form, [key]: val });

  if (!form) return <div className="empty-state">Loading user settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="User Settings" description="Registration rules and password policy. Changes here take effect immediately for new sign-ups.">
        <form onSubmit={save}>
          <Toggle checked={form.allowRegistration} onChange={setToggle('allowRegistration')} label="Allow new registrations" />
          <Toggle checked={form.requireEmailVerification} onChange={setToggle('requireEmailVerification')} label="Require email verification" />
          <Toggle checked={form.requirePhoneVerification} onChange={setToggle('requirePhoneVerification')} label="Require phone verification" />
          <Toggle checked={form.requireUsername} onChange={setToggle('requireUsername')} label="Require a username at sign-up" />
          <Toggle checked={form.passwordComplexity} onChange={setToggle('passwordComplexity')} label="Require strong passwords (upper, lower, number)" />

          <div className="field-row" style={{ marginTop: 12 }}>
            <div className="field-group"><label>Minimum password length</label><input type="number" min="8" max="64" value={form.minPasswordLength} 
onChange={set('minPasswordLength', true)} /></div>
            <div className="field-group"><label>Max login attempts</label><input type="number" min="3" max="20" value={form.maxLoginAttempts} 
onChange={set('maxLoginAttempts', true)} /></div>
            <div className="field-group"><label>Account lock duration (minutes)</label><input type="number" min="1" value={form.accountLockMinutes} 
onChange={set('accountLockMinutes', true)} /></div>
          </div>

          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save user settings'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
