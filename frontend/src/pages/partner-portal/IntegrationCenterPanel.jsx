import { useEffect, useState } from 'react';
import {
  listApiKeys, generateApiKey, regenerateApiKey, revokeApiKey,
  listWebhooks, createWebhook, updateWebhook, deleteWebhook
} from '../../api/partnerPortalApi';

function pillClass(status) {
  if (status === 'active') return 'jd-portal-pill jd-portal-pill-active';
  if (status === 'revoked' || status === 'disabled') return 'jd-portal-pill jd-portal-pill-revoked';
  return 'jd-portal-pill jd-portal-pill-neutral';
}

export default function IntegrationCenterPanel({ isActive }) {
  const [keys, setKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [revealedKey, setRevealedKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [newEnv, setNewEnv] = useState('sandbox');
  const [newKeyPassword, setNewKeyPassword] = useState('');
  const [regeneratingLiveId, setRegeneratingLiveId] = useState(null);
  const [regenPassword, setRegenPassword] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState('order.paid, order.shipped');

  const load = () => {
    listApiKeys().then(({ data }) => setKeys(data.apiKeys)).catch(() => {});
    listWebhooks().then(({ data }) => setWebhooks(data.webhooks)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  if (!isActive) {
    return (
      <div className="jd-portal-card">
        <div className="jd-portal-locked">
          <div className="jd-portal-locked-icon">🔒</div>
          <strong>The Integration Center unlocks once your partnership is approved.</strong>
        </div>
      </div>
    );
  }

  const doGenerate = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await generateApiKey({ label: newLabel || undefined, environment: newEnv, currentPassword: newEnv === 'live' ? newKeyPassword : undefined });
      setRevealedKey(data.apiKey.fullKey);
      setNewLabel(''); setNewKeyPassword('');
      load();
    } catch (err) { setError(err?.friendlyMessage || 'Could not generate API key.'); }
    finally { setBusy(false); }
  };

  const doRegenerate = async (id, isLive) => {
    if (isLive && regeneratingLiveId !== id) { setRegeneratingLiveId(id); return; }
    setBusy(true); setError(null);
    try {
      const { data } = await regenerateApiKey(id, isLive ? regenPassword : undefined);
      setRevealedKey(data.apiKey.fullKey);
      setRegeneratingLiveId(null); setRegenPassword('');
      load();
    } catch (err) { setError(err?.friendlyMessage || 'Could not regenerate API key.'); }
    finally { setBusy(false); }
  };

  const doRevoke = async (id) => {
    setBusy(true); setError(null);
    try { await revokeApiKey(id); load(); }
    catch (err) { setError(err?.friendlyMessage || 'Could not revoke API key.'); }
    finally { setBusy(false); }
  };

  const doCreateWebhook = async () => {
    if (!newWebhookUrl) return;
    setBusy(true); setError(null);
    try {
      await createWebhook({ callbackUrl: newWebhookUrl, events: newWebhookEvents.split(',').map((e) => e.trim()).filter(Boolean) });
      setNewWebhookUrl('');
      load();
    } catch (err) { setError(err?.friendlyMessage || 'Could not register webhook.'); }
    finally { setBusy(false); }
  };

  const toggleWebhook = async (webhook) => {
    setBusy(true);
    try { await updateWebhook(webhook.id, { status: webhook.status === 'active' ? 'disabled' : 'active' }); load(); }
    finally { setBusy(false); }
  };

  const removeWebhook = async (id) => {
    setBusy(true);
    try { await deleteWebhook(id); load(); }
    catch (err) { setError(err?.friendlyMessage || 'Could not remove webhook.'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {error && <div className="jd-portal-card" style={{ padding: '14px 20px' }}><span className="jd-portal-pill jd-portal-pill-error">{error}</span></div>}

      {revealedKey && (
        <div className="jd-portal-card">
          <div className="jd-portal-card-title" style={{ marginBottom: 10 }}>Copy your new API key now</div>
          <div className="jd-portal-key-reveal">
            <span>{revealedKey}</span>
            <button
              className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }}
              onClick={() => { navigator.clipboard?.writeText(revealedKey); }}
            >Copy</button>
          </div>
          <div className="jd-portal-card-sub">This is the only time the full key is shown. Store it securely.</div>
          <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px', marginTop: 10 }} onClick={() => setRevealedKey(null)}>Dismiss</button>
        </div>
      )}

      <div className="jd-portal-card">
        <div className="jd-portal-card-head">
          <div>
            <div className="jd-portal-card-title">API Credentials</div>
            <div className="jd-portal-card-sub">Generate and manage keys used to call the JEDIDA API</div>
          </div>
        </div>
        <div className="jd-portal-field-row" style={{ marginBottom: newEnv === 'live' ? 10 : 18 }}>
          <div><input placeholder="Key label (optional)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
          <div>
            <select value={newEnv} onChange={(e) => setNewEnv(e.target.value)}>
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </select>
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={doGenerate}>Generate API Key</button>
        </div>
        {newEnv === 'live' && (
          <div className="jd-portal-field-row" style={{ marginBottom: 18 }}>
            <div><input type="password" placeholder="Confirm your account password" value={newKeyPassword} onChange={(e) => setNewKeyPassword(e.target.value)} /></div>
          </div>
        )}
        <div className="jd-portal-card-sub" style={{ marginBottom: 18 }}>
          Live keys reach real production data — they require two-factor authentication to already be enabled on your account and your current password.
        </div>
        <div className="jd-portal-table-wrap">
          <table className="jd-portal-table">
            <thead><tr><th>Label</th><th>Key</th><th>Environment</th><th>Status</th><th>Last Used</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.label}</td>
                  <td style={{ fontFamily: 'monospace' }}>{k.key_prefix}••••{k.last_four}</td>
                  <td>{k.environment}</td>
                  <td><span className={pillClass(k.status)}>{k.status}</span></td>
                  <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</td>
                  <td style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {k.status === 'active' && (
                      <>
                        {regeneratingLiveId === k.id ? (
                          <>
                            <input type="password" placeholder="Confirm password" value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} style={{ width: 140 }} />
                            <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} disabled={!regenPassword} onClick={() => doRegenerate(k.id, true)}>Confirm</button>
                            <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => { setRegeneratingLiveId(null); setRegenPassword(''); }}>Cancel</button>
                          </>
                        ) : (
                          <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => doRegenerate(k.id, k.environment === 'live')}>Regenerate</button>
                        )}
                        <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => doRevoke(k.id)}>Revoke</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && <tr><td colSpan={6}><div className="empty-state">No API keys yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-head">
          <div>
            <div className="jd-portal-card-title">Webhooks</div>
            <div className="jd-portal-card-sub">Configure callback URLs to receive real-time platform events</div>
          </div>
        </div>
        <div className="jd-portal-field-row" style={{ marginBottom: 18 }}>
          <div><input placeholder="https://yourapp.com/webhooks/jedida" value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)} /></div>
          <div><input placeholder="Events (comma separated)" value={newWebhookEvents} onChange={(e) => setNewWebhookEvents(e.target.value)} /></div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={doCreateWebhook}>Add Webhook</button>
        </div>
        <div className="jd-portal-table-wrap">
          <table className="jd-portal-table">
            <thead><tr><th>Callback URL</th><th>Events</th><th>Status</th><th>Last Triggered</th><th /></tr></thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id}>
                  <td style={{ wordBreak: 'break-all' }}>{w.callback_url}</td>
                  <td>{(w.events || []).join(', ') || '—'}</td>
                  <td><span className={pillClass(w.status)}>{w.status}</span></td>
                  <td>{w.last_triggered_at ? new Date(w.last_triggered_at).toLocaleString() : 'Never'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => toggleWebhook(w)}>
                      {w.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => removeWebhook(w.id)}>Remove</button>
                  </td>
                </tr>
              ))}
              {webhooks.length === 0 && <tr><td colSpan={5}><div className="empty-state">No webhooks configured yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
