import { useEffect, useState } from 'react';
import { getSandboxSample, listSandboxLogs, testApiConnection, testWebhook, listApiKeys, listWebhooks } from '../../api/partnerPortalApi';

export default function SandboxPanel({ isActive }) {
  const [sample, setSample] = useState(null);
  const [logs, setLogs] = useState([]);
  const [keys, setKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    listSandboxLogs().then(({ data }) => setLogs(data.logs)).catch(() => {});
    listApiKeys().then(({ data }) => setKeys(data.apiKeys.filter((k) => k.status === 'active'))).catch(() => {});
    listWebhooks().then(({ data }) => setWebhooks(data.webhooks)).catch(() => {});
  };

  useEffect(() => {
    getSandboxSample().then(({ data }) => setSample(data)).catch(() => {});
    if (isActive) load();
  }, [isActive]);

  if (!isActive) {
    return (
      <div className="jd-portal-card">
        <div className="jd-portal-locked">
          <div className="jd-portal-locked-icon">🔒</div>
          <strong>The Sandbox unlocks once your partnership is approved.</strong>
        </div>
      </div>
    );
  }

  const runApiTest = async () => {
    setBusy(true);
    try { await testApiConnection({ apiKeyId: selectedKey || null, endpoint: '/v1/ping' }); load(); }
    finally { setBusy(false); }
  };

  const runWebhookTest = async (id) => {
    setBusy(true);
    try { await testWebhook(id); load(); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {sample && (
        <div className="jd-portal-card">
          <div className="jd-portal-card-title" style={{ marginBottom: 12 }}>Sample Request &amp; Response</div>
          <div className="jd-portal-card-sub" style={{ marginBottom: 6 }}>Request</div>
          <div className="jd-portal-log-json">{JSON.stringify(sample.sampleRequest, null, 2)}</div>
          <div className="jd-portal-card-sub" style={{ margin: '14px 0 6px' }}>Response</div>
          <div className="jd-portal-log-json">{JSON.stringify(sample.sampleResponse, null, 2)}</div>
        </div>
      )}

      <div className="jd-portal-card">
        <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Test API Connection</div>
        <div className="jd-portal-field-row">
          <div>
            <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
              <option value="">No key (expect a failure)</option>
              {keys.map((k) => <option key={k.id} value={k.id}>{k.label} ({k.key_prefix}••{k.last_four})</option>)}
            </select>
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={runApiTest}>Run Test</button>
        </div>
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Test Webhooks</div>
        {webhooks.length === 0 && <div className="empty-state">No webhooks configured yet — add one in the Integration Center.</div>}
        {webhooks.map((w) => (
          <div key={w.id} className="jd-portal-log-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ wordBreak: 'break-all' }}>{w.callback_url}</span>
            <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} disabled={busy} onClick={() => runWebhookTest(w.id)}>Send Test Event</button>
          </div>
        ))}
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-head">
          <div>
            <div className="jd-portal-card-title">Integration Logs</div>
            <div className="jd-portal-card-sub">Recent sandbox activity — API tests and webhook deliveries</div>
          </div>
          <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} onClick={load}>Refresh</button>
        </div>
        {logs.length === 0 && <div className="empty-state">No sandbox activity yet.</div>}
        {logs.map((log) => (
          <div key={log.id} className="jd-portal-log-row">
            <span className={`jd-portal-pill ${log.success ? 'jd-portal-pill-active' : 'jd-portal-pill-error'}`}>
              {log.kind === 'api_test' ? 'API Test' : 'Webhook Test'} · {log.success ? 'Success' : 'Failed'}
            </span>
            <div className="jd-portal-log-meta">{log.target} · {new Date(log.created_at).toLocaleString()} · {log.duration_ms}ms</div>
            <div className="jd-portal-log-json">{JSON.stringify(log.response_payload, null, 2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
