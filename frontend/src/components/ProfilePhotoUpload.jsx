import { useEffect, useRef, useState } from 'react';
import { uploadFormData, timeoutForFileSize } from '../api/client';
import { compressImage } from '../../utils/compressImage';
import { validateFileForUpload } from '../../utils/uploadValidation';
import { broadcastProfilePhotoUpdate } from '../utils/profileSync';
import Icon from './icons/icon';

// Avatar and cover photo upload, sharing one implementation. Posts straight
// to the dedicated profile endpoints (not the general /uploads route) so
// the backend can apply avatar-appropriate validation (minimum dimensions)
// and update users.avatar_url / users.cover_image_url in the same request —
// see profileController.js uploadAvatar/uploadCoverImage.
//
// On success:
//   1. onUploaded(user) — lets the caller (e.g. MyProfile) update its own
//      local state immediately, no refetch needed.
//   2. broadcastProfilePhotoUpdate(...) — a same-tab CustomEvent so every
//      other already-mounted surface showing this person's avatar (header,
//      chat, dashboards) can patch itself in place too. The backend also
//      emits a 'profile:updated' socket event for surfaces connected over
//      a live socket (chat is currently the only one) — this event covers
//      everywhere else in this tab without needing a persistent connection.
export default function ProfilePhotoUpload({
  variant = 'avatar', // 'avatar' | 'cover'
  currentUrl,
  fullName,
  onUploaded
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef(null);
  const objectUrlRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const isAvatar = variant === 'avatar';
  const endpoint = isAvatar ? '/profile/me/avatar' : '/profile/me/cover';
  const displayUrl = previewUrl || currentUrl;

  const initials = (fullName || '?').trim().split(/\s+/)
    .map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file) => {
    setError('');
    const check = validateFileForUpload(file, ['image']);
    if (!check.ok) { setError(check.error); return; }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(objectUrlRef.current);

    setUploading(true);
    setProgress(0);
    abortRef.current = new AbortController();

    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressed);

      const { data } = await uploadFormData(endpoint, formData, {
        timeout: timeoutForFileSize(compressed.size),
        signal: abortRef.current.signal,
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      });

      onUploaded?.(data.user);
      broadcastProfilePhotoUpdate({
        userId: data.user.id,
        avatarUrl: data.user.avatar_url,
        coverImageUrl: data.user.cover_image_url,
        field: variant
      });
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') {
        setError('Upload canceled.');
      } else {
        setError(err.response?.data?.error || err.friendlyMessage || 'Could not upload this photo.');
      }
      // Revert to the last-known-good image rather than leaving a broken
      // local preview visible after a failed upload.
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (isAvatar) {
    return (
      <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%', background: '#fff', border: '4px solid #fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.6rem', fontWeight: 700, color: 'var(--forest)'
        }}>
          {displayUrl ? (
            <img src={displayUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading ? 0.6 : 1 }} />
          ) : initials}
        </div>
        <button
          type="button"
          onClick={pickFile}
          disabled={uploading}
          aria-label="Change profile photo"
          style={{
            position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: '50%',
            background: 'var(--forest)', color: '#fff', border: '2px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'default' : 'pointer'
          }}
        >
          {uploading ? <span style={{ fontSize: '0.6rem' }}>{progress}%</span> : <Icon name="upload" size={14} color="#fff" />}
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onInputChange} />
        {error && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, width: 200, fontSize: '0.75rem', color: 'var(--error, #c0392b)' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // Cover variant — full-width band with a change-photo affordance,
  // replacing the plain background div MyProfile.jsx used before.
  return (
    <div style={{ position: 'relative', height: 160, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        background: displayUrl ? `url(${displayUrl}) center/cover` : 'linear-gradient(160deg, var(--forest), var(--forest-dark))',
        opacity: uploading ? 0.6 : 1
      }} />
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        className="btn-secondary"
        style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="upload" size={14} />
        {uploading ? `Uploading… ${progress}%` : 'Change cover photo'}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onInputChange} />
      {error && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.6)', color: '#fff',
          padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
