import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import MarketplaceHeader from '../components/MarketplaceHeader';
import {
  changePassword, listSessions, revokeSession, logoutAllSessions, getLoginHistory,
  setupTwoFactor, verifyTwoFactor, disableTwoFactor
} from '../api/accountSecurityApi';

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await changePassword(current, next);
      setMessage({ type: 'success', text: data.message || 'Password updated.' });
      setCurrent(''); setNext('');
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not change password.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>Change Password</h3>
      {message && <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{message.text}</div>}
      <div className="field-group"><label>Current password</label><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div className="field-group"><label>New password</label><input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
      <button className="btn-primary" disabled={busy || !current || !next} onClick={submit}>{busy ? 'Updating…' : 'Update password'}</button>
    </div>
  );
}

function TwoFactorSection() {
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const startSetup = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await setupTwoFactor();
      setSecret(data.secret);
      setQrDataUrl(await QRCode.toDataURL(data.otpauthUrl));
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not start setup.' });
    } finally { setBusy(false); }
  };

  const confirmSetup = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await verifyTwoFactor(code);
      setBackupCodes(data.backupCodes);
      setQrDataUrl(null); setSecret(null); setCode('');
      setMessage({ type: 'success', text: data.message || 'Two-factor authentication is now enabled.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'That code is incorrect or has expired.' });
    } finally { setBusy(false); }
  };

  const doDisable = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await disableTwoFactor(disablePassword);
      setMessage({ type: 'success', text: data.message || 'Two-factor authentication has been disabled.' });
      setDisablePassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not disable two-factor authentication.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>Two-Factor Authentication</h3>
      {message && <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{message.text}</div>}

      {backupCodes && (
        <div style={{ marginBottom: 16 }}>
          <p className="product-card-meta" style={{ marginBottom: 8 }}>
            Save these backup codes somewhere safe — each can be used once if you lose access to your authenticator app.
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8,
            fontFamily: 'monospace', background: 'var(--cream-dim)', padding: 12, borderRadius: 8
          }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
        </div>
      )}

      {!qrDataUrl && !backupCodes && (
        <button className="btn-primary" disabled={busy} onClick={startSetup}>Enable Two-Factor Authentication</button>
      )}

      {qrDataUrl && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 8 }}>
          <img src={qrDataUrl} alt="Two-factor QR code" style={{ width: 160, height: 160, borderRadius: 12 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="product-card-meta" style={{ marginBottom: 6 }}>Scan with your authenticator app, or enter manually:</p>
            <div style={{ fontFamily: 'monospace', marginBottom: 12, wordBreak: 'break-all' }}>{secret}</div>
            <div className="field-group"><label>6-digit code</label><input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <button className="btn-primary" disabled={busy || code.length < 6} onClick={confirmSetup}>Confirm</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, borderTop: '1px solid var(--border-soft, #E4E0D8)', paddingTop: 16 }}>
        <p className="product-card-meta" style={{ marginBottom: 8 }}>Disable two-factor authentication</p>
        <div className="field-group"><label>Current password</label><input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} /></div>
        <button className="btn-secondary" disabled={busy || !disablePassword} onClick={doDisable}>Disable</button>
      </div>
    </div>
  );
}

function SessionsSection() {
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => listSessions().then(({ data }) => setSessions(data.sessions || data));
  useEffect(() => { load(); }, []);

  const revoke = async (id) => {
    setBusy(true);
    try { await revokeSession(id); load(); } finally { setBusy(false); }
  };

  const revokeAll = async () => {
    setBusy(true);
    try { await logoutAllSessions(); load(); } finally { setBusy(false); }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3>Active Sessions</h3>
        <button className="btn-secondary" disabled={busy} onClick={revokeAll}>Sign Out Everywhere</button>
      </div>
      {sessions.length === 0 && <div className="empty-state">No active sessions found.</div>}
      {sessions.map((s) => {
        const rowStyle = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 0',
          borderBottom: '1px solid var(--border-soft, #E4E0D8)'
        };
        return (
          <div key={s.id} style={rowStyle}>
            <div>
              <div>{s.device_name || s.platform || 'Unknown device'}{s.isCurrent ? ' (this device)' : ''}</div>
              <div className="product-card-meta">Last used {s.last_used_at ? new Date(s.last_used_at).toLocaleString() : new Date(s.created_at).toLocaleString()}</div>
            </div>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} disabled={busy} onClick={() => revoke(s.id)}>Revoke</button>
          </div>
        );
      })}
    </div>
  );
}

function LoginHistorySection() {
  const [history, setHistory] = useState([]);
  useEffect(() => { getLoginHistory().then(({ data }) => setHistory(data.history)); }, []);

  return (
    <div className="card-surface">
      <h3 style={{ marginBottom: 14 }}>Login History</h3>
      {history.length === 0 && <div className="empty-state">No login history yet.</div>}
      {history.map((h, i) => {
        const rowStyle = {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 0',
          borderBottom: '1px solid var(--border-soft, #E4E0D8)'
        };
        const badgeStyle = {
          background: h.success ? undefined : '#F4D9D6',
          color: h.success ? undefined : '#8A2E24'
        };
        return (
          <div key={i} style={rowStyle}>
            <span className="product-card-badge" style={badgeStyle}>{h.success ? 'Success' : 'Failed'}</span>
            <span className="product-card-meta">{h.ip_address} · {new Date(h.created_at).toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AccountSecurity({ embedded = false } = {}) {
  return (
    <div>
      {!embedded && <MarketplaceHeader />}
      <div className="dash-body" style={{ maxWidth: 700 }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 20 }}>Security Settings</h1>
        <PasswordSection />
        <TwoFactorSection />
        <SessionsSection />
        <LoginHistorySection />
      </div>
    </div>
  );
}
