import { useState } from 'react';
import * as staysApi from '../../api/staysApi';

const SHARE_DURATIONS = [
  { value: 'hourly', label: '1 Hour' },
  { value: 'daily', label: '24 Hours' },
  { value: 'weekend', label: '3 Days' },
  { value: 'weekly', label: '7 Days' },
  { value: 'custom', label: 'Custom' },
];

export default function StayPassCard({ bookingId }) {
  const [pass, setPass] = useState(null);
  const [shares, setShares] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [shareForm, setShareForm] = useState({ duration: 'daily', customHours: 24, label: '' });
  const [shareLink, setShareLink] = useState('');

  const load = async () => {
    setError('');
    try {
      const { data } = await staysApi.getStayPass(bookingId);
      setPass(data.pass);
      const sharesRes = await staysApi.listPassShareLinks(data.pass.id);
      setShares(sharesRes.data.shares || []);
      setOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No Stay Pass available yet.');
      setOpen(true);
    }
  };

  const download = async () => {
    try {
      const { data } = await staysApi.downloadStayPassPdf(bookingId);
      const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (err) {
      setError('Could not download the Stay Pass PDF.');
    }
  };

  const share = async () => {
    try {
      const { data } = await staysApi.createPassShareLink(pass.id, shareForm);
      setShareLink(data.shareUrl);
      const sharesRes = await staysApi.listPassShareLinks(pass.id);
      setShares(sharesRes.data.shares || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create share link.');
    }
  };

  const revoke = async (shareId) => {
    await staysApi.revokePassShareLink(pass.id, shareId);
    const sharesRes = await staysApi.listPassShareLinks(pass.id);
    setShares(sharesRes.data.shares || []);
  };

  if (!open) {
    return <button className="btn-secondary" onClick={load}>🎫 View Stay Pass</button>;
  }

  return (
    <div className="card-surface" style={{ padding: 14, marginTop: 8 }}>
      {error && <div className="apf-error-text">{error}</div>}
      {pass && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>🎫 {pass.pass_number}</strong>
            <span style={{
              fontSize: '0.72rem', fontWeight: 600,
              color: pass.status === 'valid' ? '#1E7A3E' : '#C23B3B',
            }}>
              {pass.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#5B6760', marginTop: 4 }}>
            {pass.property_name} · {pass.check_in?.slice?.(0, 10) || pass.check_in} → {pass.check_out?.slice?.(0, 10) || pass.check_out}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#8A9189' }}>
            Guest: {pass.guest_name} · Host: {pass.host_name} · {pass.guests_count} guest(s)
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8A9189', marginTop: 4 }}>
            Verification code: {pass.verification_code}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-primary" onClick={download}>Download PDF</button>
          </div>

          <div style={{ marginTop: 14, borderTop: '1px solid #EDEFEC', paddingTop: 10 }}>
            <strong style={{ fontSize: '0.85rem' }}>Share this pass</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'flex-end' }}>
              <select value={shareForm.duration} onChange={(e) => setShareForm({ ...shareForm, duration: e.target.value })}>
                {SHARE_DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              {shareForm.duration === 'custom' && (
                <input type="number" min="1" value={shareForm.customHours}
                  onChange={(e) => setShareForm({ ...shareForm, customHours: e.target.value })}
                  style={{ width: 80 }} placeholder="Hours" />
              )}
              <input placeholder="Label (e.g. For the driver)" value={shareForm.label}
                onChange={(e) => setShareForm({ ...shareForm, label: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
              <button className="btn-secondary" onClick={share} disabled={pass.status !== 'valid'}>Create Link</button>
            </div>
            {shareLink && (
              <div style={{ fontSize: '0.78rem', marginTop: 8, wordBreak: 'break-all', background: '#EEF4EF', padding: 8, borderRadius: 6 }}>
                {shareLink}
              </div>
            )}

            {shares.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {shares.map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '4px 0' }}>
                    <span>{s.label || 'Share link'} — expires {new Date(s.expires_at).toLocaleString()}{s.revoked_at ? ' (revoked)' : ''}</span>
                    {!s.revoked_at && <button className="btn-secondary" style={{ padding: '1px 6px' }} onClick={() => revoke(s.id)}>Revoke</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
