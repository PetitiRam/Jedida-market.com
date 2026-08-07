import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  changePassword, getLoginHistory, listSessions, revokeSession, logoutAllSessions,
  setupTwoFactor, verifyTwoFactor, disableTwoFactor
} from '../../api/partnerPortalApi';

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await changePassword(current, next);
      setMessage({ type: 'success', text: data.message });
      setCurrent(''); setNext('');
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not change password.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Change Password</div>
      {message && <div className={`jd-portal-pill ${message.type === 'error' ? 'jd-portal-pill-error' : 'jd-portal-pill-active'}`} style={{ marginBottom: 12 }}>{message.text}</div>}
      <div className="jd-portal-field-row">
        <div><input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div><input type="password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy || !current || !next} onClick={submit}>Update</button>
      </div>
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
    } catch (err) { setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not start setup.' }); }
    finally { setBusy(false); }
  };

  const confirmSetup = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await verifyTwoFactor(code);
      setBackupCodes(data.backupCodes);
      setQrDataUrl(null); setSecret(null); setCode('');
      setMessage({ type: 'success', text: data.message });
    } catch (err) { setMessage({ type: 'error', text: err?.friendlyMessage || 'That code is incorrect or has expired.' }); }
    finally { setBusy(false); }
  };

  const doDisable = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await disableTwoFactor(disablePassword);
      setMessage({ type: 'success', text: data.message });
      setDisablePassword('');
    } catch (err) { setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not disable two-factor authentication.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Two-Factor Authentication</div>
      {message && <div className={`jd-portal-pill ${message.type === 'error' ? 'jd-portal-pill-error' : 'jd-portal-pill-active'}`} style={{ marginBottom: 12 }}>{message.text}</div>}

      {backupCodes && (
        <div style={{ marginBottom: 16 }}>
          <div className="jd-portal-card-sub" style={{ marginBottom: 8 }}>Save these backup codes somewhere safe — each can be used once if you lose access to your authenticator app.</div>
          <div className="jd-portal-backup-codes">
            {backupCodes.map((c) => <div key={c} className="jd-portal-log-row" style={{ margin: 0 }}>{c}</div>)}
          </div>
        </div>
      )}

      {!qrDataUrl && !backupCodes && (
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={startSetup}>Enable Two-Factor Authentication</button>
      )}

      {qrDataUrl && (
        <div className="jd-portal-qr-box">
          <img src={qrDataUrl} alt="Two-factor QR code" style={{ width: 160, height: 160, borderRadius: 12 }} />
          <div>
            <div className="jd-portal-card-sub" style={{ marginBottom: 6 }}>Scan with your authenticator app, or enter manually:</div>
            <div style={{ fontFamily: 'monospace', marginBottom: 12 }}>{secret}</div>
            <div className="jd-portal-field-row">
              <div><input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} /></div>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={confirmSetup}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div className="jd-portal-card-sub" style={{ marginBottom: 8 }}>Disable two-factor authentication</div>
        <div className="jd-portal-field-row">
          <div><input type="password" placeholder="Current password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} /></div>
          <button className="btn-secondary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy || !disablePassword} onClick={doDisable}>Disable</button>
        </div>
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
    <div className="jd-portal-card">
      <div className="jd-portal-card-head">
        <div className="jd-portal-card-title">Active Sessions</div>
        <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} disabled={busy} onClick={revokeAll}>Sign Out Everywhere</button>
      </div>
      {sessions.length === 0 && <div className="empty-state">No active sessions found.</div>}
      {sessions.map((s) => (
        <div key={s.id} className="jd-portal-log-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div>{s.device_name || s.platform || 'Unknown device'}{s.isCurrent ? ' (this device)' : ''}</div>
            <div className="jd-portal-log-meta">Last used {s.last_used_at ? new Date(s.last_used_at).toLocaleString() : new Date(s.created_at).toLocaleString()}</div>
          </div>
          <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} disabled={busy} onClick={() => revoke(s.id)}>Revoke</button>
        </div>
      ))}
    </div>
  );
}

function LoginHistorySection() {
  const [history, setHistory] = useState([]);
  useEffect(() => { getLoginHistory().then(({ data }) => setHistory(data.history)); }, []);

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Login History</div>
      {history.length === 0 && <div className="empty-state">No login history yet.</div>}
      {history.map((h, i) => (
        <div key={i} className="jd-portal-log-row">
          <span className={`jd-portal-pill ${h.success ? 'jd-portal-pill-active' : 'jd-portal-pill-error'}`}>{h.success ? 'Success' : 'Failed'}</span>
          <div className="jd-portal-log-meta">{h.ip_address} · {new Date(h.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

export default function SecurityPanel() {
  return (
    <div>
      <PasswordSection />
      <TwoFactorSection />
      <SessionsSection />
      <LoginHistorySection />
    </div>
  );
}
