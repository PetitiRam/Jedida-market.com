import { useEffect, useState } from 'react';
import {
  getCompanyProfile, updateCompanyProfile, uploadCompanyLogo, requestProfileChange,
  addPartnerContact, updatePartnerContact, deletePartnerContact
} from '../../api/partnerPortalApi';

const SENSITIVE_FIELDS = [
  { key: 'company_name', label: 'Company Name' },
  { key: 'registration_number', label: 'Registration Number' },
  { key: 'business_email', label: 'Business Email' },
  { key: 'physical_address', label: 'Physical Address' },
  { key: 'country', label: 'Country' },
];

export default function CompanyProfilePanel() {
  const [data, setData] = useState(null);
  const [website, setWebsite] = useState('');
  const [sensitive, setSensitive] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [newContact, setNewContact] = useState({ fullName: '', position: '', email: '', phone: '' });

  const load = () => getCompanyProfile().then(({ data }) => {
    setData(data);
    setWebsite(data.application.website || '');
    const seed = {};
    SENSITIVE_FIELDS.forEach((f) => { seed[f.key] = data.application[f.key] || ''; });
    setSensitive(seed);
  });

  useEffect(() => { load(); }, []);

  if (!data) return <div className="jd-portal-card"><div className="empty-state">Loading company profile…</div></div>;

  const saveWebsite = async () => {
    setBusy(true); setMessage(null);
    try {
      await updateCompanyProfile({ website });
      setMessage({ type: 'success', text: 'Website updated.' });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not update website.' });
    } finally { setBusy(false); }
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMessage(null);
    try {
      await uploadCompanyLogo(file);
      setMessage({ type: 'success', text: 'Logo updated.' });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not upload logo.' });
    } finally { setBusy(false); }
  };

  const submitSensitiveChanges = async () => {
    setBusy(true); setMessage(null);
    try {
      const { data: result } = await requestProfileChange(sensitive);
      setMessage({ type: 'success', text: result.message || 'Change request submitted for admin approval.' });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not submit change request.' });
    } finally { setBusy(false); }
  };

  const submitContact = async () => {
    if (!newContact.fullName || !newContact.email) return;
    setBusy(true); setMessage(null);
    try {
      await addPartnerContact(newContact);
      setNewContact({ fullName: '', position: '', email: '', phone: '' });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not add contact.' });
    } finally { setBusy(false); }
  };

  const removeContact = async (id) => {
    setBusy(true);
    try { await deletePartnerContact(id); load(); }
    catch (err) { setMessage({ type: 'error', text: err?.friendlyMessage || 'Could not remove contact.' }); }
    finally { setBusy(false); }
  };

  const togglePrimary = async (contact) => {
    setBusy(true);
    try { await updatePartnerContact(contact.id, { isPrimary: true }); load(); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {message && (
        <div className="jd-portal-card" style={{ padding: '14px 20px' }}>
          <span className={message.type === 'error' ? 'jd-portal-pill jd-portal-pill-error' : 'jd-portal-pill jd-portal-pill-active'}>
            {message.text}
          </span>
        </div>
      )}

      <div className="jd-portal-card">
        <div className="jd-portal-card-head">
          <div>
            <div className="jd-portal-card-title">Company Logo</div>
            <div className="jd-portal-card-sub">Shown across the marketplace and in partner communications</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {data.application.logo_url
            ? <img src={data.application.logo_url} alt="Company logo" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
            : <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--jd-input-bg)' }} />}
          <label className="btn-secondary" style={{ width: 'auto', padding: '8px 18px', cursor: 'pointer' }}>
            Upload New Logo
            <input type="file" accept="image/*" hidden onChange={handleLogoChange} disabled={busy} />
          </label>
        </div>
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Website</div>
        <div className="jd-portal-field-row">
          <div>
            <input placeholder="https://yourcompany.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={saveWebsite}>Save</button>
        </div>
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-head">
          <div>
            <div className="jd-portal-card-title">Company Information</div>
            <div className="jd-portal-card-sub">These fields require administrator approval before they take effect</div>
          </div>
        </div>
        {SENSITIVE_FIELDS.map((f) => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
            <input
             
              value={sensitive[f.key] || ''}
              onChange={(e) => setSensitive((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={submitSensitiveChanges}>
          Submit for Approval
        </button>

        {data.changeRequests.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="jd-portal-card-sub" style={{ marginBottom: 8 }}>Recent change requests</div>
            {data.changeRequests.map((r) => (
              <div key={r.id} className="jd-portal-log-row">
                <span className={`jd-portal-pill jd-portal-pill-${r.status === 'approved' ? 'active' : r.status === 'rejected' ? 'error' : 'pending'}`}>
                  {r.status}
                </span>
                <div className="jd-portal-log-meta">
                  {Object.keys(r.changes).join(', ')} · {new Date(r.created_at).toLocaleString()}
                </div>
                {r.review_notes && <div className="jd-portal-log-meta">Note: {r.review_notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="jd-portal-card">
        <div className="jd-portal-card-title" style={{ marginBottom: 14 }}>Contact Persons</div>
        <div className="jd-portal-table-wrap">
          <table className="jd-portal-table">
            <thead><tr><th>Name</th><th>Position</th><th>Email</th><th>Phone</th><th>Primary</th><th /></tr></thead>
            <tbody>
              {data.contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td>{c.position || '—'}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    {c.is_primary
                      ? <span className="jd-portal-pill jd-portal-pill-active">Primary</span>
                      : <button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => togglePrimary(c)}>Make primary</button>}
                  </td>
                  <td><button className="btn-secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => removeContact(c.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="jd-portal-field-row" style={{ marginTop: 16 }}>
          <div><input placeholder="Full name" value={newContact.fullName} onChange={(e) => setNewContact((c) => ({ ...c, fullName: e.target.value }))} /></div>
          <div><input placeholder="Position" value={newContact.position} onChange={(e) => setNewContact((c) => ({ ...c, position: e.target.value }))} /></div>
          <div><input placeholder="Email" value={newContact.email} onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))} /></div>
          <div><input placeholder="Phone" value={newContact.phone} onChange={(e) => setNewContact((c) => ({ ...c, phone: e.target.value }))} /></div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={busy} onClick={submitContact}>Add</button>
        </div>
      </div>
    </div>
  );
}
