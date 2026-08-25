import { useEffect, useState, useCallback } from 'react';
import { normalizeError } from '../../api/client';
import * as api from '../../api/securityOps';
import '../../styles/security-ops.css';

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`jd-sec-tile${tone ? ` is-${tone}` : ''}`}>
      <div className="jd-sec-tile-label">{label}</div>
      <div className="jd-sec-tile-value">{value}</div>
      {sub && <div className="jd-sec-tile-sub">{sub}</div>}
    </div>
  );
}

function ThreatScoreCard({ threatScore }) {
  if (!threatScore) return null;
  const { score, level, inputs } = threatScore;
  return (
    <div className="jd-sec-threat-card">
      <div className={`jd-sec-threat-ring level-${level}`}>{score}</div>
      <div className="jd-sec-threat-body">
        <strong>AI threat level: {level}</strong>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Computed from real signals across the platform, refreshed on every load.</span>
        <div className="jd-sec-threat-inputs">
          <span>{inputs.openFraudFlagWeight} open fraud-flag severity points</span>
          <span>{inputs.criticalEvents24h} critical events (24h)</span>
          <span>{inputs.ipsAutoBlocked24h} IPs auto-blocked (24h)</span>
          <span>{inputs.failedLoginsLastHour} failed logins (1h)</span>
          <span>{inputs.unresolvedAlerts} unresolved alerts</span>
        </div>
      </div>
    </div>
  );
}

function EventsFeed({ events, onResolve }) {
  if (events.length === 0) return <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No events match this filter.</p>;
  return (
    <div className="jd-sec-list">
      {events.map((e) => (
        <div className="jd-sec-event" key={e.id}>
          <span className={`jd-sec-sev-dot jd-sec-sev-${e.severity}`} />
          <div className="jd-sec-event-body">
            <div className="jd-sec-event-meta">
              <span>{e.event_type.replace(/_/g, ' ')}{e.ip_address ? ` · ${e.ip_address}` : ''}</span>
              <span>{new Date(e.created_at).toLocaleString()}</span>
            </div>
            <div>{e.summary}</div>
          </div>
          {!e.resolved && e.severity >= 3 && (
            <button type="button" className="jd-sec-resolve-btn" onClick={() => onResolve(e.id)}>Resolve</button>
          )}
        </div>
      ))}
    </div>
  );
}

function BlockedIpsPanel() {
  const [ips, setIps] = useState([]);
  const [form, setForm] = useState({ ipAddress: '', reason: '', expiresInHours: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.listBlockedIps().then(({ data }) => setIps(data.blockedIps || [])).catch((err) => setError(normalizeError(err).friendlyMessage));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.ipAddress.trim()) return;
    setError('');
    try {
      await api.blockIpAddress({
        ipAddress: form.ipAddress.trim(),
        reason: form.reason || undefined,
        expiresInHours: form.expiresInHours ? Number(form.expiresInHours) : undefined,
      });
      setForm({ ipAddress: '', reason: '', expiresInHours: '' });
      load();
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    }
  };

  const unblock = async (id) => {
    try {
      await api.unblockIpAddress(id);
      setIps((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    }
  };

  return (
    <div className="jd-sec-list">
      <form className="jd-sec-block-form" onSubmit={submit}>
        <input placeholder="IP address" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} required />
        <input placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
        <input placeholder="Expires in hours (blank = indefinite)" type="number" value={form.expiresInHours} onChange={(e) => setForm({ ...form, expiresInHours: e.target.value })} style={{ width: 220 }} />
        <button type="submit">Block IP</button>
      </form>
      {error && <p style={{ color: '#C94B4B', fontSize: 13 }}>{error}</p>}
      {ips.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No IPs currently blocked.</p>}
      {ips.map((ip) => (
        <div className="jd-sec-ip-row" key={ip.id}>
          <code>{ip.ip_address}</code>
          <div className="jd-sec-ip-meta">
            {ip.reason} · {ip.blocked_by === 'ai' ? 'Auto-blocked' : 'Manual'} · {ip.hit_count} repeat attempt{ip.hit_count === 1 ? '' : 's'} since blocked
            {ip.expires_at && ` · expires ${new Date(ip.expires_at).toLocaleString()}`}
          </div>
          <button type="button" onClick={() => unblock(ip.id)}>Unblock</button>
        </div>
      ))}
    </div>
  );
}

function AuditLogPanel() {
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(() => {
    setLoading(true);
    api.searchAuditLog({ search: search || undefined }).then(({ data }) => setEntries(data.entries || [])).finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="jd-sec-list">
      <div className="jd-sec-filters">
        <input placeholder="Search by action or resource type…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 260 }} />
        <button type="button" className="jd-sec-resolve-btn" onClick={run} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </div>
      {entries.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No audit entries match.</p>}
      {entries.map((e) => (
        <div className="jd-sec-event" key={e.id}>
          <div className="jd-sec-event-body">
            <div className="jd-sec-event-meta">
              <span>{e.action.replace(/_/g, ' ')} · {e.resource}{e.role ? ` · ${e.role}` : ''}</span>
              <span>{new Date(e.created_at).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.success ? 'Success' : 'Failed'}{e.ip_address ? ` · ${e.ip_address}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FaceVerificationPanel() {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => api.getFaceVerificationSettings().then(({ data }) => setConfig(data.config));
  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    setBusy(true); setMessage(null);
    try {
      const { data } = await api.updateFaceVerificationSettings(patch);
      setConfig(data.config);
      setMessage({ type: 'success', text: 'Settings saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: normalizeError(err).friendlyMessage || 'Could not save settings.' });
    } finally { setBusy(false); }
  };

  if (!config) return <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p>;

  const isLive = config.enabled && config.provider !== 'none';

  return (
    <div>
      <div className="jd-sec-tiles" style={{ marginBottom: 16 }}>
        <Tile label="Status" value={isLive ? 'Enabled' : 'Disabled'} tone={isLive ? 'ok' : 'elevated'} />
        <Tile label="Provider" value={config.provider === 'aws_rekognition' ? 'AWS Rekognition' : 'None'} />
        <Tile label="Match threshold" value={`${Number(config.match_threshold)}%`} />
      </div>

      {message && (
        <p style={{ fontSize: 13, marginBottom: 12, color: message.type === 'error' ? '#C94B4B' : '#2E7D4F' }}>{message.text}</p>
      )}

      <div className="jd-sec-section-title"><h3>Provider</h3></div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Requires AWS Rekognition credentials to be configured on the server (AWS_REGION plus standard AWS
        credentials with rekognition:CompareFaces permission). Switching this on before credentials are set
        will still fail closed with a provider error — it will not silently pass anyone.
      </p>
      <select
        value={config.provider}
        disabled={busy}
        onChange={(e) => save({ provider: e.target.value })}
        style={{ marginBottom: 16 }}
      >
        <option value="none">None (disabled)</option>
        <option value="aws_rekognition">AWS Rekognition</option>
      </select>

      <div className="jd-sec-section-title"><h3>Match threshold</h3></div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Minimum confidence percentage (70–99.9) required for a captured face to be accepted as a match against
        the user's approved KYC selfie.
      </p>
      <input
        type="number" min={70} max={99.9} step={0.1} value={config.match_threshold}
        disabled={busy}
        onChange={(e) => setConfig({ ...config, match_threshold: e.target.value })}
        onBlur={(e) => save({ matchThreshold: e.target.value })}
        style={{ width: 100, marginBottom: 16 }}
      />

      <div className="jd-sec-section-title"><h3>Master switch</h3></div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Turns enforcement on or off platform-wide for every action gated behind face verification (admin refunds,
        large withdrawals, payout method changes, shop deletion). Leave off until the provider above is
        genuinely ready.
      </p>
      <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy} onClick={() => save({ enabled: !config.enabled })}>
        {config.enabled ? 'Disable enforcement' : 'Enable enforcement'}
      </button>
    </div>
  );
}

export default function SecurityOperationsDashboard() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState({ resolved: 'false', severityMin: '' });
  const [tab, setTab] = useState('overview');

  const loadOverview = useCallback(() => {
    api.getSecurityOverview().then(({ data }) => setOverview(data)).catch((err) => setError(normalizeError(err).friendlyMessage));
  }, []);
  const loadEvents = useCallback(() => {
    const params = {};
    if (eventFilter.resolved !== '') params.resolved = eventFilter.resolved;
    if (eventFilter.severityMin) params.severityMin = eventFilter.severityMin;
    api.listSecurityEvents(params).then(({ data }) => setEvents(data.events || [])).catch((err) => setError(normalizeError(err).friendlyMessage));
  }, [eventFilter]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Light polling so "live" attacks actually feel live without a websocket.
  useEffect(() => {
    const t = setInterval(() => { loadOverview(); loadEvents(); }, 30000);
    return () => clearInterval(t);
  }, [loadOverview, loadEvents]);

  const resolve = async (id) => {
    try {
      await api.resolveSecurityEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      loadOverview();
    } catch (err) {
      setError(normalizeError(err).friendlyMessage);
    }
  };

  const maxTraffic = overview?.apiTraffic?.reduce((m, r) => Math.max(m, Number(r.request_count)), 1) || 1;

  return (
    <div className="jd-sec">
      {error && <p style={{ color: '#C94B4B', fontSize: 13 }}>{error}</p>}

      <div className="tab-scroll" style={{ marginBottom: 4 }}>
        <button className={`tab-pill ${tab === 'overview' ? 'tab-pill-active' : ''}`} onClick={() => setTab('overview')}>🛡 Overview</button>
        <button className={`tab-pill ${tab === 'events' ? 'tab-pill-active' : ''}`} onClick={() => setTab('events')}>⚡ Live Events</button>
        <button className={`tab-pill ${tab === 'ips' ? 'tab-pill-active' : ''}`} onClick={() => setTab('ips')}>🚫 Blocked IPs</button>
        <button className={`tab-pill ${tab === 'audit' ? 'tab-pill-active' : ''}`} onClick={() => setTab('audit')}>📜 Audit Log</button>
        <button className={`tab-pill ${tab === 'face' ? 'tab-pill-active' : ''}`} onClick={() => setTab('face')}>🪪 Face Verification</button>
      </div>

      {tab === 'overview' && overview && (
        <>
          <ThreatScoreCard threatScore={overview.threatScore} />
          <div className="jd-sec-tiles">
            <Tile label="Attacks blocked (24h)" value={overview.liveAttacksBlocked.total24h} tone={overview.liveAttacksBlocked.total24h > 20 ? 'critical' : undefined} />
            <Tile label="Failed logins (1h)" value={overview.failedLogins.last_1h} sub={`${overview.failedLogins.last_24h} in last 24h`} tone={overview.failedLogins.last_1h > 10 ? 'elevated' : undefined} />
            <Tile label="Active sessions" value={overview.activeSessions.total} sub={overview.activeSessions.byPlatform.map((p) => `${p.platform || 'web'}: ${p.count}`).join(' · ')} />
            <Tile label="Blocked IPs" value={overview.blockedIps} />
            <Tile label="Unresolved alerts" value={overview.unresolvedAlerts} tone={overview.unresolvedAlerts > 0 ? 'elevated' : 'ok'} />
            <Tile label="Malware detections (7d)" value={overview.malwareDetections7d} tone={overview.malwareDetections7d > 0 ? 'critical' : 'ok'} />
          </div>

          <div className="jd-sec-section-title"><h3>API traffic (last 24h)</h3></div>
          {overview.apiTraffic.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Not enough traffic yet to chart.</p>
          ) : (
            <div className="jd-sec-traffic-bars">
              {overview.apiTraffic.map((h) => (
                <div
                  key={h.hour_bucket}
                  className={`jd-sec-traffic-bar${Number(h.blocked_count) > 0 ? ' has-blocked' : ''}`}
                  style={{ height: `${Math.max(4, (Number(h.request_count) / maxTraffic) * 60)}px` }}
                  title={`${new Date(h.hour_bucket).toLocaleTimeString()} — ${h.request_count} requests, ${h.blocked_count} blocked`}
                />
              ))}
            </div>
          )}

          <div className="jd-sec-section-title"><h3>High-risk users</h3></div>
          {overview.highRiskUsers.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No users currently have open fraud flags.</p>
          ) : (
            <>
              <div className="jd-table-scroll">
                <table className="jd-sec-risk-table">
                  <thead><tr><th>User</th><th>Email</th><th>Open flags</th><th>Max severity</th></tr></thead>
                  <tbody>
                    {overview.highRiskUsers.map((u) => (
                      <tr key={u.user_id}><td>{u.name}</td><td>{u.email}</td><td>{u.flag_count}</td><td>{u.max_severity}/5</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="jd-row-cards">
                {overview.highRiskUsers.map((u) => (
                  <div className="jd-row-card" key={u.user_id}>
                    <div className="jd-row-card-head">
                      <div className="jd-row-card-title">{u.name}</div>
                      <span className="status-chip">{u.max_severity}/5 severity</span>
                    </div>
                    <div className="jd-row-card-fields">
                      <div>{u.email}</div>
                      <div>{u.flag_count} open flag{u.flag_count === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'events' && (
        <>
          <div className="jd-sec-filters">
            <select value={eventFilter.resolved} onChange={(e) => setEventFilter({ ...eventFilter, resolved: e.target.value })}>
              <option value="false">Unresolved</option>
              <option value="true">Resolved</option>
              <option value="">All</option>
            </select>
            <select value={eventFilter.severityMin} onChange={(e) => setEventFilter({ ...eventFilter, severityMin: e.target.value })}>
              <option value="">Any severity</option>
              <option value="3">Alert+ (3+)</option>
              <option value="4">Critical+ (4+)</option>
            </select>
          </div>
          <EventsFeed events={events} onResolve={resolve} />
        </>
      )}

      {tab === 'ips' && <BlockedIpsPanel />}
      {tab === 'audit' && <AuditLogPanel />}
      {tab === 'face' && <FaceVerificationPanel />}
    </div>
  );
}
