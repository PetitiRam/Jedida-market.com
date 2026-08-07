import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import {
  listPartnerApps, submitPartnerAppInterest,
  getDropshipStatus, enrollDropshipping, cancelDropshipEnrollment
} from '../api/partnerAppsApi';
import '../styles/partner.css';

function InterestModal({ app, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setState('loading'); setError(null);
    try {
      await submitPartnerAppInterest(app.id, form);
      setState('done');
    } catch (err) {
      setError(err?.friendlyMessage || 'Could not submit your interest. Please try again.');
      setState('error');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div className="jd-portal-card" style={{ maxWidth: 420, width: '100%', margin: 0 }} onClick={(e) => e.stopPropagation()}>
        {state === 'done' ? (
          <>
            <div className="jd-portal-card-title" style={{ marginBottom: 10 }}>Thanks!</div>
            <p className="jd-portal-card-sub">{app.company_name} has been notified and may reach out to you directly.</p>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px', marginTop: 10 }} onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <div className="jd-portal-card-title" style={{ marginBottom: 10 }}>Try {app.company_name}</div>
            {error && <div className="jd-portal-pill jd-portal-pill-error" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ marginBottom: 10 }}><input placeholder="Your name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div style={{ marginBottom: 10 }}><input placeholder="Your email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <textarea rows={3} placeholder="What would you like to use this for? (optional)" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} style={{ width: '100%', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={state === 'loading'} onClick={submit}>Send</button>
              <button className="btn-secondary" style={{ width: 'auto', padding: '10px 20px' }} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DropshipModal({ app, onClose }) {
  const [status, setStatus] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => getDropshipStatus(app.id)
    .then(({ data }) => setStatus(data))
    .catch((err) => setMessage({ type: 'error', text: err?.friendlyMessage === 'Please sign in to continue.' ? 'Sign in to enroll in dropshipping.' : (err?.friendlyMessage || 'Could not load dropshipping details.') }));

  useEffect(() => { load(); }, []);

  const enroll = async () => {
    setBusy(true); setMessage(null);
    try {
      await enrollDropshipping(app.id, acknowledged);
      setMessage({ type: 'success', text: `You're enrolled to dropship with ${app.company_name}.` });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not enroll.' });
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setMessage(null);
    try {
      await cancelDropshipEnrollment(app.id);
      setMessage({ type: 'success', text: 'Dropshipping enrollment cancelled.' });
      load();
    } finally { setBusy(false); }
  };

  const isEnrolled = status?.enrollment?.status === 'active';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div className="jd-portal-card" style={{ maxWidth: 520, width: '100%', margin: 0, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="jd-portal-card-title" style={{ marginBottom: 10 }}>Dropship with {app.company_name}</div>
        {message && <div className={`jd-portal-pill ${message.type === 'error' ? 'jd-portal-pill-error' : 'jd-portal-pill-active'}`} style={{ marginBottom: 12 }}>{message.text}</div>}

        {status && (
          <>
            <div className="jd-portal-card-sub" style={{ marginBottom: 8 }}>Read and follow this partner's instructions before enrolling:</div>
            <div className="jd-portal-log-json" style={{ maxHeight: 260, whiteSpace: 'pre-wrap' }}>{status.app.instructions}</div>

            {isEnrolled ? (
              <div style={{ marginTop: 16 }}>
                <span className="jd-portal-pill jd-portal-pill-active">You're enrolled</span>
                <div style={{ marginTop: 12 }}>
                  <button className="btn-secondary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={cancel}>Cancel Enrollment</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: '0.86rem' }}>
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 3 }} />
                  I have read and will follow {app.company_name}'s dropshipping instructions.
                </label>
                <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy || !acknowledged} onClick={enroll}>Enroll</button>
              </div>
            )}
          </>
        )}
        <button className="btn-secondary" style={{ width: 'auto', padding: '8px 18px', marginTop: 16 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function AppCard({ app, onTry, onDropship }) {
  return (
    <div className="jd-portal-card" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
        {app.logo_url
          ? <img src={app.logo_url} alt={app.company_name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
          : <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--jd-input-bg)' }} />}
        <div>
          <div className="jd-portal-card-title" style={{ marginBottom: 0 }}>{app.company_name}</div>
          {app.directory_category && <div className="jd-portal-card-sub">{app.directory_category}</div>}
        </div>
      </div>
      {app.directory_tagline && <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 14 }}>{app.directory_tagline}</p>}
      {app.dropshipping_available && <span className="jd-portal-pill jd-portal-pill-active" style={{ marginBottom: 14, display: 'inline-block' }}>Dropshipping Available</span>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {app.directory_try_url
          ? <a className="btn-primary" style={{ width: 'auto', padding: '9px 18px', textDecoration: 'none', textAlign: 'center' }} href={app.directory_try_url} target="_blank" rel="noreferrer">Try This App</a>
          : <button className="btn-primary" style={{ width: 'auto', padding: '9px 18px' }} onClick={() => onTry(app)}>I'm Interested</button>}
        {app.directory_try_url && <button className="btn-secondary" style={{ width: 'auto', padding: '9px 18px' }} onClick={() => onTry(app)}>I'm Interested</button>}
        {app.dropshipping_available && (
          <button className="btn-secondary" style={{ width: 'auto', padding: '9px 18px' }} onClick={() => onDropship(app)}>Dropship With Them</button>
        )}
      </div>
    </div>
  );
}

export default function PartnerAppsDirectory() {
  const [apps, setApps] = useState(null);
  const [category, setCategory] = useState('');
  const [dropshippingOnly, setDropshippingOnly] = useState(false);
  const [interestApp, setInterestApp] = useState(null);
  const [dropshipApp, setDropshipApp] = useState(null);

  useEffect(() => {
    listPartnerApps({ category: category || undefined, dropshippingOnly: dropshippingOnly ? 'true' : undefined })
      .then(({ data }) => setApps(data.apps))
      .catch(() => setApps([]));
  }, [category, dropshippingOnly]);

  const categories = Array.from(new Set((apps || []).map((a) => a.directory_category).filter(Boolean)));

  return (
    <div className="jd-partner">
      <span className="jd-partner-glow-a" />
      <span className="jd-partner-glow-b" />
      <div className="jd-partner-topbar">
        <Link to="/"><Logo size={32} /></Link>
        <ThemeToggle />
      </div>

      <div className="jd-portal-shell">
        <div className="jd-portal-header">
          <div>
            <div className="jd-portal-header-title">Partner Apps</div>
            <div className="jd-portal-header-sub">Integrations and services built by JEDIDA's approved partners — try them, connect with them, or dropship through them.</div>
          </div>
        </div>

        <div className="jd-portal-card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem' }}>
            <input type="checkbox" checked={dropshippingOnly} onChange={(e) => setDropshippingOnly(e.target.checked)} />
            Dropshipping only
          </label>
        </div>

        {apps === null && <div className="jd-portal-card"><div className="empty-state">Loading partner apps…</div></div>}
        {apps && apps.length === 0 && <div className="jd-portal-card"><div className="empty-state">No partner apps match these filters yet.</div></div>}

        {apps && apps.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {apps.map((app) => (
              <AppCard key={app.id} app={app} onTry={setInterestApp} onDropship={setDropshipApp} />
            ))}
          </div>
        )}
      </div>

      {interestApp && <InterestModal app={interestApp} onClose={() => setInterestApp(null)} />}
      {dropshipApp && <DropshipModal app={dropshipApp} onClose={() => setDropshipApp(null)} />}
    </div>
  );
}
