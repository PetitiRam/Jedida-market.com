import { useEffect, useState } from 'react';
import { getDirectoryListing, updateDirectoryListing, getDropshippingProgram, updateDropshippingProgram } from '../../api/partnerPortalApi';

function DirectoryListingSection() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ listed: false, tagline: '', category: '', tryUrl: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => getDirectoryListing().then(({ data }) => {
    setData(data);
    setForm({
      listed: data.listing.listed,
      tagline: data.listing.tagline || '',
      category: data.listing.category || '',
      tryUrl: data.listing.tryUrl || ''
    });
  });
  useEffect(() => { load(); }, []);

  const save = async (listed) => {
    setBusy(true); setMessage(null);
    try {
      const { data: result } = await updateDirectoryListing({ ...form, listed });
      setMessage({ type: 'success', text: result.message });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not update your listing.' });
    } finally { setBusy(false); }
  };

  if (!data) return <div className="jd-portal-card"><div className="empty-state">Loading directory listing…</div></div>;

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-head">
        <div>
          <div className="jd-portal-card-title">Partner Apps Directory</div>
          <div className="jd-portal-card-sub">List your integration on the public Partner Apps page so marketplace users can find and try it</div>
        </div>
        {data.listing.listed && <span className="jd-portal-pill jd-portal-pill-active">Listed</span>}
      </div>
      {message && <div className={`jd-portal-pill ${message.type === 'error' ? 'jd-portal-pill-error' : 'jd-portal-pill-active'}`} style={{ marginBottom: 12 }}>{message.text}</div>}

      <div style={{ marginBottom: 12 }}>
        <input placeholder="Short tagline (shown on your card)" value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
      </div>
      <div className="jd-portal-field-row" style={{ marginBottom: 12 }}>
        <div><input placeholder="Category (e.g. Payments, Delivery)" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
        <div><input placeholder="Try / connect URL (optional)" value={form.tryUrl} onChange={(e) => setForm((f) => ({ ...f, tryUrl: e.target.value }))} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {!data.listing.listed
          ? <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={() => save(true)}>List My App</button>
          : (
            <>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={() => save(true)}>Save Changes</button>
              <button className="btn-secondary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={() => save(false)}>Unlist</button>
            </>
          )}
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="jd-portal-card-sub" style={{ marginBottom: 8 }}>Recent leads from the directory</div>
        {data.leads.length === 0 && <div className="empty-state">No leads yet.</div>}
        {data.leads.map((lead) => (
          <div key={lead.id} className="jd-portal-log-row">
            <strong>{lead.name}</strong> · {lead.email}
            {lead.message && <div className="jd-portal-log-meta">{lead.message}</div>}
            <div className="jd-portal-log-meta">{new Date(lead.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DropshippingSection() {
  const [data, setData] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => getDropshippingProgram().then(({ data }) => { setData(data); setInstructions(data.instructions || ''); });
  useEffect(() => { load(); }, []);

  const save = async (available) => {
    setBusy(true); setMessage(null);
    try {
      const { data: result } = await updateDropshippingProgram({ available, instructions });
      setMessage({ type: 'success', text: result.message });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not update your dropshipping program.' });
    } finally { setBusy(false); }
  };

  if (!data) return <div className="jd-portal-card"><div className="empty-state">Loading dropshipping program…</div></div>;

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-head">
        <div>
          <div className="jd-portal-card-title">Dropshipping Program</div>
          <div className="jd-portal-card-sub">Sellers can dropship through your integration once they read and accept these instructions</div>
        </div>
        {data.available && <span className="jd-portal-pill jd-portal-pill-active">{data.activeEnrollments} enrolled</span>}
      </div>
      {message && <div className={`jd-portal-pill ${message.type === 'error' ? 'jd-portal-pill-error' : 'jd-portal-pill-active'}`} style={{ marginBottom: 12 }}>{message.text}</div>}

      <textarea
        rows={8}
        placeholder="Explain exactly how a seller should dropship through your platform: how to connect their catalog, how orders are relayed to you, fulfillment timelines, return handling, and any requirements you have."
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        style={{ width: '100%', marginBottom: 14 }}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        {!data.available
          ? <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy || !instructions.trim()} onClick={() => save(true)}>Enable Dropshipping Program</button>
          : (
            <>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy || !instructions.trim()} onClick={() => save(true)}>Save Instructions</button>
              <button className="btn-secondary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={() => save(false)}>Disable Program</button>
            </>
          )}
      </div>
    </div>
  );
}

export default function DirectoryPanel({ isActive }) {
  if (!isActive) {
    return (
      <div className="jd-portal-card">
        <div className="jd-portal-locked">
          <div className="jd-portal-locked-icon">🔒</div>
          <strong>The Partner Apps directory and dropshipping program unlock once your partnership is approved.</strong>
        </div>
      </div>
    );
  }
  return (
    <div>
      <DirectoryListingSection />
      <DropshippingSection />
    </div>
  );
}
