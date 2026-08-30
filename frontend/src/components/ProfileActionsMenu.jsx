import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Icon from './icons/icon';
import { OPEN_CHAT_EVENT } from './header/MessagesMenu';

const REPORT_REASONS = [
  { key: 'fake_profile', label: 'Fake profile' },
  { key: 'impersonation', label: 'Impersonating someone else' },
  { key: 'scam', label: 'Scam or fraud' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate_speech', label: 'Hate speech' },
  { key: 'inappropriate_content', label: 'Inappropriate content' },
  { key: 'other', label: 'Something else' }
];

// Follow button, Message button, and the block/report overflow menu shown
// on someone else's public profile. Kept as one component since all four
// actions read/write the same relationship with this one person and share
// the "am I signed in" gate.
export default function ProfileActionsMenu({ userId, isFollowing: initialFollowing, isSignedIn, onFollowChange }) {
  const navigate = useNavigate();
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [followBusy, setFollowBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  useEffect(() => setIsFollowing(initialFollowing), [initialFollowing]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClickOutside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  const requireSignIn = () => {
    navigate('/signin', { state: { from: window.location.pathname } });
  };

  const toggleFollow = async () => {
    if (!isSignedIn) return requireSignIn();
    setFollowBusy(true);
    setError('');
    try {
      if (isFollowing) {
        await client.delete(`/profile/${userId}/follow`);
        setIsFollowing(false);
        onFollowChange?.(false);
      } else {
        await client.post(`/profile/${userId}/follow`);
        setIsFollowing(true);
        onFollowChange?.(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!isSignedIn) return requireSignIn();
    setMessageBusy(true);
    setError('');
    try {
      // Reuses the existing chat-v2 conversation system — same endpoint
      // shop pages use to start a product conversation, just without a
      // productId. See routes/chatV2.js contact-product.
      const { data } = await client.post('/chat-v2/contact-product', { sellerId: userId });
      window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { conversationId: data.conversation.id } }));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not open a conversation with this user.');
    } finally {
      setMessageBusy(false);
    }
  };

  const blockUser = async () => {
    if (!window.confirm('Block this user? They will no longer be able to follow, message, or see your activity.')) return;
    setMenuOpen(false);
    try {
      await client.post(`/profile/${userId}/block`);
      setIsFollowing(false);
      onFollowChange?.(false, { blocked: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not block this user.');
    }
  };

  const submitReport = async () => {
    if (!reportReason) return;
    setReportBusy(true);
    setError('');
    try {
      await client.post(`/profile/${userId}/report`, { reason: reportReason, details: reportDetails || undefined });
      setReportDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit this report.');
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
      <button
        type="button"
        className={isFollowing ? 'btn-secondary' : 'btn-primary'}
        onClick={toggleFollow}
        disabled={followBusy}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="userPlus" size={15} />
        {followBusy ? '…' : isFollowing ? 'Following' : 'Follow'}
      </button>

      <button
        type="button"
        className="btn-secondary"
        onClick={sendMessage}
        disabled={messageBusy}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="message" size={15} />
        {messageBusy ? '…' : 'Message'}
      </button>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          className="btn-secondary"
          aria-label="More actions"
          onClick={() => setMenuOpen((v) => !v)}
          style={{ padding: '8px 10px' }}
        >
          <Icon name="moreVertical" size={16} />
        </button>
        {menuOpen && (
          <div className="card-surface" style={{
            position: 'absolute', top: '110%', right: 0, minWidth: 180, padding: 6, zIndex: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
          }}>
            <MenuItem icon="flag" label="Report" onClick={() => { setMenuOpen(false); setReportOpen(true); }} />
            <MenuItem icon="slash" label="Block" danger onClick={blockUser} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, fontSize: '0.8rem', color: 'var(--error, #c0392b)', whiteSpace: 'nowrap' }}>
          {error}
        </div>
      )}

      {reportOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div className="card-surface" style={{ maxWidth: 420, width: '100%' }}>
            {reportDone ? (
              <>
                <h3 style={{ marginBottom: 8 }}>Report submitted</h3>
                <p style={{ color: '#5B6760', marginBottom: 16 }}>Thanks — our team will review this profile.</p>
                <button className="btn-primary" onClick={() => { setReportOpen(false); setReportDone(false); setReportReason(''); setReportDetails(''); }}>Done</button>
              </>
            ) : (
              <>
                <h3 style={{ marginBottom: 12 }}>Report this profile</h3>
                <div className="field-group">
                  <label>Reason</label>
                  <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                    <option value="">Select a reason…</option>
                    {REPORT_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label>Additional details (optional)</label>
                  <textarea rows={3} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
                </div>
                {error && <div className="alert alert-error">{error}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => setReportOpen(false)} disabled={reportBusy}>Cancel</button>
                  <button className="btn-primary" onClick={submitReport} disabled={reportBusy || !reportReason}>
                    {reportBusy ? 'Submitting…' : 'Submit report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
        background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: 6,
        color: danger ? 'var(--error, #c0392b)' : 'inherit', fontSize: '0.9rem'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}
