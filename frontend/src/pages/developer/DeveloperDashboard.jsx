import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as developerPlatformApi from '../../api/developerPlatformApi';
import '../../styles/developer-platform.css';

// Nav items that are fully wired to real data in this phase. Everything
// else in the spec (Projects, Applications, Sandbox, Integration Hub,
// Partner Apps, Marketplace Apps, SDK Downloads, API Explorer, Webhooks,
// Events, Logs, Analytics, Developer AI, Documentation, Support, Security,
// Finance, Settings) is shown as a real, clickable nav item so the shape of
// the eventual product is visible — but each opens an honest "coming in a
// later phase" panel rather than fake data, until its own phase lands.
const LIVE_VIEWS = new Set(['dashboard', 'api-centre', 'organizations', 'api-keys', 'oauth-apps', 'sandbox']);

const NAV_GROUPS = [
  { label: 'General', items: [
    ['dashboard', '📊', 'Dashboard'],
    ['projects', '🗂️', 'Projects'],
    ['applications', '🧩', 'Applications'],
    ['organizations', '🏢', 'Developer Organizations'],
  ]},
  { label: 'Developer', items: [
    ['api-centre', '🔌', 'API Centre'],
    ['api-keys', '🔑', 'API Keys'],
    ['oauth-apps', '🔐', 'OAuth Applications'],
    ['sandbox', '🧪', 'Sandbox'],
    ['production', '🚀', 'Production'],
    ['integration-hub', '🔗', 'Integration Hub'],
    ['partner-apps', '🧱', 'Partner Apps'],
    ['marketplace-apps', '🛍️', 'Marketplace Apps'],
    ['sdk-downloads', '📦', 'SDK Downloads'],
    ['api-explorer', '▶️', 'API Explorer'],
    ['webhooks', '🪝', 'Webhooks'],
    ['events', '📡', 'Events'],
    ['logs', '📜', 'Logs'],
    ['analytics', '📈', 'Analytics'],
    ['developer-ai', '✨', 'Developer AI'],
    ['documentation', '📘', 'Documentation'],
    ['support', '🆘', 'Support'],
  ]},
  { label: 'Account', items: [
    ['security', '🛡️', 'Security'],
    ['finance', '💰', 'Finance'],
    ['settings', '⚙️', 'Settings'],
  ]},
];

function ComingSoonPanel({ label }) {
  return (
    <div className="jdp-empty-panel">
      <b>{label}</b>
      This part of the Developer &amp; Partner Platform is on the roadmap for a later phase —
      it isn't built yet, so there's nothing to show here yet.
    </div>
  );
}

export default function DeveloperDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [view, setView] = useState('dashboard');
  const [error, setError] = useState('');

  // Phase 51 — API Keys / OAuth Applications / Sandbox
  const [apiKeys, setApiKeys] = useState([]);
  const [oauthApps, setOAuthApps] = useState([]);
  const [sandboxResources, setSandboxResources] = useState([]);
  const [sandboxTypes, setSandboxTypes] = useState([]);
  const [revealedSecret, setRevealedSecret] = useState(null); // { label, value } — shown once
  const [panelError, setPanelError] = useState('');
  const [panelBusy, setPanelBusy] = useState(false);

  function refreshApiKeys() {
    developerPlatformApi.listApiKeys().then(({ data }) => setApiKeys(data.keys)).catch(() => {});
  }
  function refreshOAuthApps() {
    developerPlatformApi.listOAuthApps().then(({ data }) => setOAuthApps(data.applications)).catch(() => {});
  }
  function refreshSandbox() {
    developerPlatformApi.listSandboxResources().then(({ data }) => setSandboxResources(data.resources)).catch(() => {});
  }

  useEffect(() => {
    if (!profile || profile.status !== 'approved') return;
    if (view === 'api-keys') refreshApiKeys();
    if (view === 'oauth-apps') refreshOAuthApps();
    if (view === 'sandbox') {
      refreshSandbox();
      developerPlatformApi.listSandboxResourceTypes().then(({ data }) => setSandboxTypes(data.resourceTypes)).catch(() => {});
    }
    setPanelError('');
    setRevealedSecret(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, profile]);

  async function handleCreateApiKey(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    setPanelBusy(true);
    setPanelError('');
    try {
      const { data } = await developerPlatformApi.createApiKey({
        name: form.get('name'),
        environment: form.get('environment'),
        scopes: (form.get('scopes') || '').split(',').map((s) => s.trim()).filter(Boolean),
      });
      setRevealedSecret({ label: 'API key', value: data.key.key });
      e.target.reset();
      refreshApiKeys();
    } catch (err) {
      setPanelError(err.response?.data?.error || 'Failed to create the API key.');
    } finally {
      setPanelBusy(false);
    }
  }

  async function handleRevokeApiKey(id) {
    try {
      await developerPlatformApi.revokeApiKey(id);
      refreshApiKeys();
    } catch (err) {
      setPanelError(err.response?.data?.error || 'Failed to revoke the key.');
    }
  }

  async function handleCreateOAuthApp(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    setPanelBusy(true);
    setPanelError('');
    try {
      const { data } = await developerPlatformApi.createOAuthApp({
        name: form.get('name'),
        description: form.get('description'),
        redirectUris: (form.get('redirectUris') || '').split(',').map((s) => s.trim()).filter(Boolean),
        scopes: (form.get('scopes') || '').split(',').map((s) => s.trim()).filter(Boolean),
      });
      setRevealedSecret({ label: 'Client secret', value: data.application.clientSecret });
      e.target.reset();
      refreshOAuthApps();
    } catch (err) {
      setPanelError(err.response?.data?.error || 'Failed to create the OAuth application.');
    } finally {
      setPanelBusy(false);
    }
  }

  async function handleSuspendOAuthApp(id) {
    try {
      await developerPlatformApi.suspendOAuthApp(id);
      refreshOAuthApps();
    } catch (err) {
      setPanelError(err.response?.data?.error || 'Failed to suspend the app.');
    }
  }

  async function handleCreateSandboxResource(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    let data = {};
    try { data = form.get('data') ? JSON.parse(form.get('data')) : {}; }
    catch { setPanelError('Sandbox data must be valid JSON.'); return; }
    setPanelBusy(true);
    setPanelError('');
    try {
      await developerPlatformApi.createSandboxResource({ resourceType: form.get('resourceType'), data });
      e.target.reset();
      refreshSandbox();
    } catch (err) {
      setPanelError(err.response?.data?.error || 'Failed to create the sandbox resource.');
    } finally {
      setPanelBusy(false);
    }
  }

  async function handleResetSandbox() {
    setPanelBusy(true);
    try {
      await developerPlatformApi.resetSandbox();
      refreshSandbox();
    } catch (err) {
      setPanelError(err.response?.data?.error || 'Failed to reset the sandbox.');
    } finally {
      setPanelBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await developerPlatformApi.getMyDeveloperProfile();
        if (cancelled) return;
        setProfile(data.developer);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load your developer profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!profile || profile.status !== 'approved') return;
    developerPlatformApi.getApiCatalog().then(({ data }) => setCatalog(data.catalog)).catch(() => {});
    developerPlatformApi.listMyOrganizations().then(({ data }) => setOrgs(data.organizations)).catch(() => {});
  }, [profile]);

  if (loading) {
    return <div className="jdp"><div className="jdp-center"><div style={{ color: 'var(--jcc-text-dim)' }}>Loading your developer dashboard…</div></div></div>;
  }

  if (!profile) {
    return (
      <div className="jdp">
        <div className="jdp-center">
          <div className="jdp-card jdp-welcome">
            <div className="jdp-mark">J</div>
            <h1>No developer profile yet</h1>
            <p>You're signed in, but you haven't applied to the Developer &amp; Partner Platform yet.</p>
            <button className="jdp-btn jdp-btn-lime" onClick={() => navigate('/developer/register')}>Register as Developer</button>
          </div>
        </div>
      </div>
    );
  }

  if (profile.status !== 'approved') {
    return (
      <div className="jdp">
        <div className="jdp-center">
          <div className="jdp-card jdp-welcome">
            <div className="jdp-mark">{profile.status === 'pending' ? '⏳' : '⚠️'}</div>
            <h1>{profile.status === 'pending' ? 'Application in review' : `Application ${profile.status}`}</h1>
            <p>
              {profile.status === 'pending' && "Your developer application is still being reviewed. You'll get access to the full dashboard once it's approved."}
              {profile.status === 'rejected' && (profile.rejection_reason || 'Your application was not approved.')}
              {profile.status === 'suspended' && 'Your developer access has been suspended. Contact support for details.'}
            </p>
            <button className="jdp-btn jdp-btn-ghost" onClick={() => navigate('/')}>Back to the marketplace</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jdp jdp-shell">
      <div className="jdp-sidebar">
        <div className="jdp-brand"><span style={{ fontSize: 18 }}>🧩</span><b>Developer Platform</b></div>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="jdp-side-label">{group.label}</div>
            {group.items.map(([key, icon, label]) => (
              <button
                key={key}
                className={`jdp-nav-item${view === key ? ' active' : ''}`}
                onClick={() => setView(key)}
              >
                <span>{icon}</span>
                <span>{label}</span>
                {!LIVE_VIEWS.has(key) && <span className="soon">soon</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="jdp-main">
        <div className="jdp-topline">
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color: '#fff' }}>
              {profile.developer_name}
            </div>
            <div style={{ color: 'var(--jcc-text-faint)', fontSize: 12 }}>{profile.email}</div>
          </div>
          <span className={`jdp-status-pill jdp-status-${profile.status}`}>● {profile.status}</span>
        </div>

        {error && <div className="jdp-alert jdp-alert-error">{error}</div>}

        {view === 'dashboard' && (
          <>
            <div className="jdp-grid" style={{ marginBottom: 24 }}>
              <div className="jdp-api-card">
                <div className="cat">Category</div>
                <div className="name">{profile.developer_category?.replace(/_/g, ' ')}</div>
              </div>
              <div className="jdp-api-card">
                <div className="cat">Organizations</div>
                <div className="name">{orgs.length}</div>
              </div>
              <div className="jdp-api-card">
                <div className="cat">Approved APIs</div>
                <div className="name">{catalog.length}</div>
              </div>
            </div>
            <div className="jdp-empty-panel">
              <b>Welcome to the Developer &amp; Partner Platform</b>
              Use API Centre to browse what's available today. Projects, Applications, API
              Keys, Sandbox and the App Marketplace are being built out in the phases after
              this one.
            </div>
          </>
        )}

        {view === 'api-centre' && (
          <div className="jdp-grid">
            {catalog.map((api) => (
              <div className="jdp-api-card" key={api.key}>
                <div className="cat">{api.category}</div>
                <div className="name">{api.name}</div>
                <div className="desc">{api.description}</div>
              </div>
            ))}
          </div>
        )}

        {view === 'organizations' && (
          <div className="jdp-grid">
            {orgs.length === 0 && (
              <div className="jdp-empty-panel">
                <b>No organizations yet</b>
                Organization creation from this screen is coming shortly — for now, ask
                support to set one up for your account.
              </div>
            )}
            {orgs.map((org) => (
              <div className="jdp-api-card" key={org.id}>
                <div className="cat">{org.role}</div>
                <div className="name">{org.name}</div>
                <div className="desc">{org.status}{org.verified_badge ? ' · Verified' : ''}</div>
              </div>
            ))}
          </div>
        )}

        {revealedSecret && (view === 'api-keys' || view === 'oauth-apps') && (
          <div className="jdp-alert jdp-alert-success" style={{ marginBottom: 16 }}>
            <b>{revealedSecret.label} — save this now, it won't be shown again:</b>
            <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', marginTop: 6 }}>
              {revealedSecret.value}
            </div>
          </div>
        )}
        {panelError && (view === 'api-keys' || view === 'oauth-apps' || view === 'sandbox') && (
          <div className="jdp-alert jdp-alert-error" style={{ marginBottom: 16 }}>{panelError}</div>
        )}

        {view === 'api-keys' && (
          <>
            <form onSubmit={handleCreateApiKey} className="jdp-card" style={{ marginBottom: 20, padding: 18 }}>
              <div className="jdp-field-row">
                <div className="jdp-field"><label>Key name</label><input name="name" required placeholder="My storefront sync" /></div>
                <div className="jdp-field">
                  <label>Environment</label>
                  <select name="environment" defaultValue="sandbox">
                    <option value="sandbox">Sandbox</option>
                    <option value="production">Production</option>
                  </select>
                </div>
              </div>
              <div className="jdp-field"><label>Scopes (comma separated)</label><input name="scopes" placeholder="products:read, orders:read" /></div>
              <button className="jdp-btn jdp-btn-lime" disabled={panelBusy} type="submit">Generate API key</button>
            </form>
            <div className="jdp-grid">
              {apiKeys.length === 0 && <div className="jdp-empty-panel"><b>No API keys yet</b>Generate one above to start calling Jedida APIs from your app.</div>}
              {apiKeys.map((k) => (
                <div className="jdp-api-card" key={k.id}>
                  <div className="cat">{k.environment}{k.status === 'revoked' ? ' · revoked' : ''}</div>
                  <div className="name">{k.name}</div>
                  <div className="desc">{k.key_prefix}••••••••{k.scopes?.length ? ` · ${k.scopes.join(', ')}` : ''}</div>
                  {k.status === 'active' && (
                    <button className="jdp-btn jdp-btn-ghost" style={{ marginTop: 10, padding: '6px 12px', fontSize: 11 }} onClick={() => handleRevokeApiKey(k.id)}>Revoke</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'oauth-apps' && (
          <>
            <form onSubmit={handleCreateOAuthApp} className="jdp-card" style={{ marginBottom: 20, padding: 18 }}>
              <div className="jdp-field"><label>Application name</label><input name="name" required placeholder="My Jedida Connect app" /></div>
              <div className="jdp-field"><label>Description</label><input name="description" placeholder="What does this app do?" /></div>
              <div className="jdp-field"><label>Redirect URIs (comma separated)</label><input name="redirectUris" required placeholder="https://myapp.com/callback" /></div>
              <div className="jdp-field"><label>Scopes (comma separated)</label><input name="scopes" placeholder="profile:read, orders:read" /></div>
              <button className="jdp-btn jdp-btn-lime" disabled={panelBusy} type="submit">Create OAuth application</button>
            </form>
            <div className="jdp-grid">
              {oauthApps.length === 0 && <div className="jdp-empty-panel"><b>No OAuth applications yet</b>Register one above to let users sign in and grant your app access.</div>}
              {oauthApps.map((a) => (
                <div className="jdp-api-card" key={a.id}>
                  <div className="cat">{a.status}</div>
                  <div className="name">{a.name}</div>
                  <div className="desc" style={{ fontFamily: 'monospace' }}>{a.client_id}</div>
                  {a.description && <div className="desc">{a.description}</div>}
                  {a.status === 'active' && (
                    <button className="jdp-btn jdp-btn-ghost" style={{ marginTop: 10, padding: '6px 12px', fontSize: 11 }} onClick={() => handleSuspendOAuthApp(a.id)}>Suspend</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'sandbox' && (
          <>
            <form onSubmit={handleCreateSandboxResource} className="jdp-card" style={{ marginBottom: 20, padding: 18 }}>
              <div className="jdp-field-row">
                <div className="jdp-field">
                  <label>Resource type</label>
                  <select name="resourceType" defaultValue={sandboxTypes[0] || ''}>
                    {sandboxTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="jdp-field"><label>Data (JSON)</label><input name="data" placeholder='{"name":"Test Store"}' /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="jdp-btn jdp-btn-lime" disabled={panelBusy} type="submit">Create sandbox resource</button>
                <button className="jdp-btn jdp-btn-ghost" type="button" disabled={panelBusy} onClick={handleResetSandbox}>Reset sandbox</button>
              </div>
            </form>
            <div className="jdp-grid">
              {sandboxResources.length === 0 && <div className="jdp-empty-panel"><b>Sandbox is empty</b>Create fake businesses, products, orders and more above to safely test your integration.</div>}
              {sandboxResources.map((r) => (
                <div className="jdp-api-card" key={r.id}>
                  <div className="cat">{r.resource_type.replace(/_/g, ' ')}</div>
                  <div className="desc" style={{ fontFamily: 'monospace', fontSize: 11 }}>{JSON.stringify(r.data)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {!LIVE_VIEWS.has(view) && (
          <ComingSoonPanel label={NAV_GROUPS.flatMap((g) => g.items).find(([k]) => k === view)?.[2] || view} />
        )}
      </div>
    </div>
  );
}
