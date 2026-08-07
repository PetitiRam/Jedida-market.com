import { useEffect, useState } from 'react';
import client from '../../../api/client';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

function ForceLogoutAllUsers() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const execute = async () => {
    setBusy(true);
    try {
      await client.post('/admin/security/force-logout-all');
      setResult('All user sessions have been revoked. Every user will need to sign in again.');
    } catch (err) {
      setResult(err.response?.data?.error || 'Could not force logout. Please try again.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
      <h5 style={{ color: '#8A2E10' }}>⚠️ Force logout all users</h5>
      <p className="product-card-meta" style={{ marginBottom: 10 }}>
        Immediately revokes every active session platform-wide. Use only after a suspected security incident.
      </p>
      {result && <div className="alert alert-success">{result}</div>}
      {!confirming ? (
        <button className="btn-secondary" onClick={() => setConfirming(true)}>Force logout all users</button>
      ) : (
        <div>
          <p style={{ color: '#8A2E10', fontWeight: 600, marginBottom: 8 }}>Are you sure? This cannot be undone.</p>
          <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px', marginRight: 8 }} disabled={busy} onClick={execute}>
            {busy ? 'Processing…' : 'Yes, force logout everyone'}
          </button>
          <button className="btn-link" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default function SecuritySettingsTab() {
  const [form, setForm] = useState(null);
  const { saving, message, run } = useSaveState();

  const load = async () => { const { data } = await api.getSection('security'); setForm(data.value); };
  useEffect(() => { load(); }, []);

  const save = (e) => { e.preventDefault(); run(() => api.updateSection('security', form)); };
  const set = (key, isNum) => (e) => setForm({ ...form, [key]: isNum ? Number(e.target.value) : e.target.value });
  const setToggle = (key) => (val) => setForm({ ...form, [key]: val });

  if (!form) return <div className="empty-state">Loading security settings…</div>;

  return (
    <div>
      <SaveFeedback message={message} />
      <SectionCard title="Security Settings" description="Token lifetimes, rate limiting, and session policy.">
        <form onSubmit={save}>
          <div className="field-row">
            <div className="field-group"><label>JWT access token expiry (minutes)</label><input type="number" value={form.jwtExpiryMinutes} 
onChange={set('jwtExpiryMinutes', true)} /></div>
            <div className="field-group"><label>Refresh token expiry (days)</label><input type="number" value={form.refreshTokenExpiryDays} 
onChange={set('refreshTokenExpiryDays', true)} /></div>
          </div>
          <div className="field-row">
            <div className="field-group"><label>Rate limit (requests/minute)</label><input type="number" value={form.rateLimitPerMinute} 
onChange={set('rateLimitPerMinute', true)} /></div>
            <div className="field-group"><label>Session timeout (minutes)</label><input type="number" value={form.sessionTimeoutMinutes} 
onChange={set('sessionTimeoutMinutes', true)} /></div>
            <div className="field-group"><label>Max devices per user</label><input type="number" value={form.maxDevices} onChange={set('maxDevices', true)} /></div>
          </div>
          <Toggle checked={form.requireStrongPasswords} onChange={setToggle('requireStrongPasswords')} label="Require strong passwords" />
          <Toggle checked={form.twoFactorEnabled} onChange={setToggle('twoFactorEnabled')} label="Enable two-factor authentication option for users" />
          <button className="btn-primary" disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving…' : 'Save security settings'}</button>
        </form>

        <ForceLogoutAllUsers />
      </SectionCard>
    </div>
  );
}
