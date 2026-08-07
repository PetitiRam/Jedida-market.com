import { useEffect, useState } from 'react';
import * as petitiApi from './petitiApi';

function AuthPolicyPanel() {
  const [policy, setPolicy] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => petitiApi.getAuthPolicy().then(({ data }) => setPolicy(data.policy));
  useEffect(() => { load(); }, []);

  // Translates a plain-language admin prompt into a bounded policy patch.
  // Deterministic keyword matching today — same pattern as Nsubuga Joseph/
  // Colline — swap for a real LLM call later without changing the endpoint.
  const interpretPrompt = (text) => {
    const t = text.toLowerCase();
    const patch = {};
    if (t.includes('stricter') || t.includes('tighter') || t.includes('secure')) {
      patch.maxFailedLogins = 3;
      patch.lockoutMinutes = 30;
      patch.minPasswordLength = 10;
    }
    if (t.includes('relax') || t.includes('looser') || t.includes('easier')) {
      patch.maxFailedLogins = 8;
      patch.lockoutMinutes = 5;
    }
    if (t.includes('otp') && t.includes('longer')) patch.otpExpiryMinutes = 20;
    if (t.includes('otp') && t.includes('shorter')) patch.otpExpiryMinutes = 5;
    if (t.includes('one') && t.includes('session')) patch.singleSessionEnforced = true;
    if (t.includes('multiple') && t.includes('session')) patch.singleSessionEnforced = false;
    if (t.includes('password') && t.includes('history') && t.includes('longer')) patch.passwordHistoryLimit = 10;
    if (t.includes('idle') || (t.includes('session') && t.includes('timeout'))) {
      patch.idleSessionTimeoutMinutes = t.includes('shorter') || t.includes('stricter') ? 1440 : 20160;
    }
    return patch;
  };

  const submitPrompt = async () => {
    const patch = interpretPrompt(prompt);
    if (Object.keys(patch).length === 0) {
      setMessage('PETITI could not map that prompt to a policy change. Try "make sign-in stricter" or "relax lockouts".');
      return;
    }
    setBusy(true);
    try {
      const { data } = await petitiApi.upgradeAuthPolicy(patch, prompt);
      setPolicy(data.policy);
      setMessage(data.message);
      setPrompt('');
    } finally {
      setBusy(false);
    }
  };

  if (!policy) return <div className="empty-state">Loading policy…</div>;

  return (
    <div className="card-surface" style={{ marginBottom: 24 }}>
      <h4>Auth security policy — prompt PETITI to adjust it</h4>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Current: lockout after {policy.max_failed_logins} failed attempts for {policy.lockout_minutes} min ·
        OTP expires in {policy.otp_expiry_minutes} min · min password length {policy.min_password_length} ·
        password history: last {policy.password_history_limit} blocked from reuse ·
        idle session timeout {Math.round(policy.idle_session_timeout_minutes / 1440)} day(s) ·
        {policy.single_session_enforced ? ' one session per account' : ' multiple sessions allowed'}
      </p>
      {message && <div className="alert alert-success">{message}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Make sign-in stricter" or "Relax the lockout policy"'
        />
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 18px' }} onClick={submitPrompt} disabled={busy || !prompt}>
          {busy ? 'Applying…' : 'Prompt PETITI'}
        </button>
      </div>
    </div>
  );
}

// Top-line counts + emergency mode switch — the "is everything OK right
// now" glance a security admin wants before reading anything else.
function CommandCenterSummary({ onChange }) {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');

  const load = () => petitiApi.getCommandCenter().then(({ data }) => setSummary(data.summary));
  useEffect(() => { load(); }, []);

  const enterEmergency = async () => {
    if (!emergencyReason.trim()) return;
    if (!window.confirm('This locks down features flagged as emergency-gated platform-wide. Continue?')) return;
    setBusy(true);
    try {
      await petitiApi.enterEmergencyMode(emergencyReason.trim());
      setEmergencyReason('');
      load(); onChange?.();
    } finally { setBusy(false); }
  };

  // Exiting is gated server-side to super admins only (requireSuperAdmin)
  // — a non-super-admin will get a 403 back from this same button, which
  // is the intended behavior, not a bug to hide from them.
  const exitEmergency = async () => {
    if (!window.confirm('Deactivate emergency lockdown?')) return;
    setBusy(true);
    try {
      await petitiApi.exitEmergencyMode();
      load(); onChange?.();
    } finally { setBusy(false); }
  };

  if (!summary) return null;
  const { accountsUnderHold, activeIpBlocks, emergencyMode } = summary;

  return (
    <div className="card-surface" style={{ marginBottom: 24 }}>
      <h4>Security Command Centre</h4>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '12px 0' }}>
        <div><strong>{accountsUnderHold.flagged}</strong><div className="product-card-meta">Flagged</div></div>
        <div><strong>{accountsUnderHold.restricted}</strong><div className="product-card-meta">Restricted</div></div>
        <div><strong>{accountsUnderHold.frozen}</strong><div className="product-card-meta">Frozen</div></div>
        <div><strong>{activeIpBlocks}</strong><div className="product-card-meta">Blocked IPs</div></div>
      </div>

      {emergencyMode.emergency_mode ? (
        <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <strong>🚨 Emergency mode is ACTIVE</strong>
            <p className="product-card-meta">{emergencyMode.emergency_mode_reason}</p>
          </div>
          <button className="btn-secondary" onClick={exitEmergency} disabled={busy}>Deactivate (super admin only)</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ flex: 1 }}
            value={emergencyReason}
            onChange={(e) => setEmergencyReason(e.target.value)}
            placeholder="Reason to activate platform-wide emergency lockdown…"
          />
          <button className="btn-secondary" style={{ width: 'auto', padding: '10px 18px' }} onClick={enterEmergency} disabled={busy || !emergencyReason.trim()}>
            Activate emergency mode
          </button>
        </div>
      )}
    </div>
  );
}

function SecurityHoldsPanel({ refreshKey }) {
  const [holds, setHolds] = useState([]);
  const load = () => petitiApi.getSecurityHolds().then(({ data }) => setHolds(data.holds || []));
  useEffect(() => { load(); }, [refreshKey]);

  const lift = async (userId) => { await petitiApi.liftSecurityState(userId); load(); };
  const forceReset = async (userId) => {
    if (!window.confirm('Require this account to reset its password before it can sign in again? This also signs it out everywhere.')) return;
    await petitiApi.requirePasswordReset(userId, 'Manually triggered by admin from Security Center.');
    load();
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <h4>Accounts under a security hold</h4>
      {holds.length === 0 ? <div className="empty-state">No accounts currently flagged, restricted, or frozen.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {holds.map((u) => (
            <div key={u.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span className={`status-chip ${u.security_state === 'frozen' ? 'status-rejected' : 'status-pending_review'}`}>{u.security_state}</span>
                <strong style={{ marginLeft: 8 }}>{u.full_name}</strong> <span className="product-card-meta">({u.email} · {u.primary_role})</span>
                <p className="product-card-meta">{u.security_state_reason}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" onClick={() => forceReset(u.id)}>Force password reset</button>
                <button className="btn-secondary" onClick={() => lift(u.id)}>Lift hold</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockedIpsPanel({ refreshKey }) {
  const [ips, setIps] = useState([]);
  const [newIp, setNewIp] = useState('');
  const [reason, setReason] = useState('');

  const load = () => petitiApi.getBlockedIps().then(({ data }) => setIps(data.ips || []));
  useEffect(() => { load(); }, [refreshKey]);

  const addBlock = async () => {
    if (!newIp.trim() || !reason.trim()) return;
    await petitiApi.blockIp(newIp.trim(), reason.trim());
    setNewIp(''); setReason(''); load();
  };
  const unblock = async (ip) => { await petitiApi.unblockIp(ip); load(); };

  return (
    <div style={{ marginBottom: 24 }}>
      <h4>Blocked IP addresses</h4>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={{ flex: 1 }} value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="IP address" />
        <input style={{ flex: 2 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <button className="btn-secondary" style={{ width: 'auto', padding: '10px 18px' }} onClick={addBlock} disabled={!newIp.trim() || !reason.trim()}>Block</button>
      </div>
      {ips.length === 0 ? <div className="empty-state">No IPs currently blocked.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ips.map((row) => (
            <div key={row.ip} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{row.ip}</strong> <span className="product-card-meta">blocked by {row.blocked_by}</span>
                <p className="product-card-meta">{row.reason}</p>
              </div>
              <button className="btn-secondary" onClick={() => unblock(row.ip)}>Unblock</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveSessionsPanel({ refreshKey }) {
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    petitiApi.getActiveSessions(50).then(({ data }) => setSessions(data.sessions || []));
  }, [refreshKey]);

  return (
    <div style={{ marginBottom: 24 }}>
      <h4>Active sessions (platform-wide)</h4>
      {sessions.length === 0 ? <div className="empty-state">No active sessions.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map((s) => (
            <div key={s.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{s.full_name}</strong> <span className="product-card-meta">({s.email})</span>
                <p className="product-card-meta">
                  {s.device_name || 'Unnamed device'} · {s.platform || 'web'} · last used {s.last_used_at ? new Date(s.last_used_at).toLocaleString() : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FailedLoginsPanel({ refreshKey }) {
  const [attempts, setAttempts] = useState([]);
  useEffect(() => {
    petitiApi.getFailedLogins(50).then(({ data }) => setAttempts(data.failedLogins || []));
  }, [refreshKey]);

  return (
    <div style={{ marginBottom: 24 }}>
      <h4>Recent failed logins</h4>
      {attempts.length === 0 ? <div className="empty-state">No failed login attempts recorded.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attempts.map((a, i) => (
            <div key={i} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{a.email}</strong> <span className="product-card-meta">from {a.ip_address}{a.city || a.country ? ` (${[a.city, a.country].filter(Boolean).join(', ')})` : ''}</span>
                <p className="product-card-meta">{new Date(a.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetectionAccuracyPanel({ refreshKey }) {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    petitiApi.getLearningStats().then(({ data }) => setCategories(data.categories || []));
  }, [refreshKey]);

  if (categories.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h4>Detection accuracy (from admin review)</h4>
      <p className="product-card-meta" style={{ marginBottom: 12 }}>
        Categories with 5+ reviewed reports get their future risk scores nudged based on how often past reports in that category were confirmed vs. dismissed as false positives.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map((c) => (
          <div key={c.category} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong>{c.category.replace(/_/g, ' ')}</strong>
              <p className="product-card-meta">
                {c.confirmed} confirmed · {c.dismissed} dismissed
                {c.falsePositiveRate !== null && ` · ${Math.round(c.falsePositiveRate * 100)}% false-positive rate`}
              </p>
            </div>
            {c.sampleSize >= 5 ? (
              <span className="product-card-badge">{c.adjustment > 0 ? `+${c.adjustment}` : c.adjustment} to future scores</span>
            ) : (
              <span className="product-card-meta">Not enough reviews yet ({c.sampleSize}/5)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SecurityCenter() {
  const [reports, setReports] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = () => {
    petitiApi.getSecurity().then(({ data }) => setReports(data.reports || []));
    petitiApi.getAlerts({ status: 'open' }).then(({ data }) => setAlerts(data.alerts || []));
  };
  useEffect(() => { load(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const { data } = await petitiApi.runSecurityScan();
      setScanResult(data.summary);
      load();
      setRefreshKey((k) => k + 1); // a scan can create new holds/blocks
    } finally { setScanning(false); }
  };

  const resolve = async (id) => { await petitiApi.resolveAlert(id); load(); setRefreshKey((k) => k + 1); };
  const dismiss = async (id) => { await petitiApi.dismissAlert(id); load(); setRefreshKey((k) => k + 1); };
  const review = async (id, outcome) => { await petitiApi.reviewFraudReport(id, outcome); load(); setRefreshKey((k) => k + 1); };

  return (
    <div>
      <CommandCenterSummary onChange={() => setRefreshKey((k) => k + 1)} />
      <SecurityHoldsPanel refreshKey={refreshKey} />
      <BlockedIpsPanel refreshKey={refreshKey} />
      <ActiveSessionsPanel refreshKey={refreshKey} />
      <FailedLoginsPanel refreshKey={refreshKey} />
      <DetectionAccuracyPanel refreshKey={refreshKey} />
      <AuthPolicyPanel />

      <button className="btn-primary" style={{ width: 'auto', padding: '12px 24px', marginBottom: 20 }} onClick={runScan} disabled={scanning}>
        {scanning ? 'PETITI is scanning…' : '🔍 Run full fraud scan'}
      </button>

      {scanResult && (
        <div className="alert alert-success">
          Scan complete: {Object.entries(scanResult).map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </div>
      )}

      <h4>Open security alerts</h4>
      {alerts.length === 0 ? <div className="empty-state">No open alerts.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {alerts.map((a) => (
            <div key={a.id} className="card-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span className={`status-chip ${a.severity === 'critical' || a.severity === 'high' ? 'status-rejected' : 'status-pending_review'}`}>{a.severity}</span>
                <strong style={{ marginLeft: 8 }}>{a.title}</strong>
                <p className="product-card-meta">{a.description}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" onClick={() => resolve(a.id)}>Resolve</button>
                <button className="btn-secondary" onClick={() => dismiss(a.id)}>Dismiss (false positive)</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h4>Fraud reports</h4>
      {reports.length === 0 ? <div className="empty-state">No fraud reports on file.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map((r) => (
            <div key={r.id} className="card-surface">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong>{r.category.replace(/_/g, ' ')}</strong> <span className="product-card-badge">Risk {r.risk_score}</span>
                  <p className="product-card-meta">{r.details}</p>
                </div>
                {r.status === 'confirmed' || r.status === 'dismissed' ? (
                  <span className="product-card-meta">Reviewed: {r.status}</span>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" onClick={() => review(r.id, 'confirmed')}>Confirm threat</button>
                    <button className="btn-secondary" onClick={() => review(r.id, 'dismissed')}>False positive</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
