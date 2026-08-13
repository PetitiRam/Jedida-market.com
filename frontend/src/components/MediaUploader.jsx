import { useEffect, useRef, useState } from 'react';
import { uploadFormData, timeoutForFileSize } from '../api/client';
import { compressImage } from '../../utils/compressImage';
import { validateFileForUpload } from '../../utils/uploadValidation';

// Which upload categories a given `accept` prop implies, so client-side
// validation (validateFileForUpload) checks against the same set the
// caller actually asked for — a KYC uploader passed accept="image/*"
// shouldn't silently accept a video just because the server would.
function categoriesFromAccept(accept) {
  const cats = [];
  if (accept.includes('image/*') || accept.includes('image/')) cats.push('image');
  if (accept.includes('video/*') || accept.includes('video/')) cats.push('video');
  if (accept.includes('audio/*') || accept.includes('audio/')) cats.push('audio');
  if (accept.includes('pdf') || accept.includes('doc') || accept.includes('xls')) cats.push('document');
  return cats.length ? cats : ['image', 'video', 'audio', 'document'];
}

export default function MediaUploader({
  onUploaded,
  accept = 'image/*,video/*',
  label = 'Upload image or video'
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewKind, setPreviewKind] = useState(null); // 'image' | 'video' | 'audio'
  const [pendingFile, setPendingFile] = useState(null); // kept so "Retry" doesn't need re-picking the file
  const abortRef = useRef(null);
  const previewUrlRef = useRef(null);

  // Revoke any object URL we created, whether on success, failure, a new
  // pick, or unmount — otherwise every selected file leaks its blob: URL
  // for the life of the tab, which adds up fast for video.
  const clearPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setPreviewKind(null);
  };
  useEffect(() => () => clearPreview(), []);

  const startUpload = async (file) => {
    setError('');
    setUploading(true);
    setProgress(0);
    abortRef.current = new AbortController();

    try {
      let finalFile = file;
      if (file.type.startsWith('image/')) {
        finalFile = await compressImage(file);
      }

      const formData = new FormData();
      formData.append('file', finalFile);

      // uploadFormData never sets Content-Type manually (the browser must
      // generate the multipart boundary itself) and uses a timeout scaled
      // to the actual file size — see api/client.js for why both matter,
      // especially for video/audio, which are the files most likely to be
      // both large and slow to upload on mobile.
      const { data } = await uploadFormData('/uploads', formData, {
        timeout: timeoutForFileSize(finalFile.size),
        signal: abortRef.current.signal,
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      });

      clearPreview();
      setPendingFile(null);
      onUploaded({ ...data.media });

    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') {
        setError('Upload canceled.');
      } else {
        console.error('Upload error:', err);
        // client.js's response interceptor normalizes every failure
        // (timeout, offline, server error, validation) into a specific
        // `friendlyMessage`, falling back to the server's own error text,
        // and only to a generic line if neither is available.
        setError(
          err.friendlyMessage ||
          err.response?.data?.error ||
          'Upload failed. Try again or use a URL instead.'
        );
      }
      // Deliberately keep the preview + pendingFile so "Retry" can
      // re-attempt without forcing the person to pick the file again —
      // especially important for a large video they just waited to select.
    } finally {
      setUploading(false);
      setProgress(0);
      abortRef.current = null;
    }
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the exact same file later
    if (!file) return;

    setError('');
    const check = validateFileForUpload(file, categoriesFromAccept(accept));
    if (!check.ok) {
      setError(check.error);
      return;
    }

    clearPreview();
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreview(url);
    setPreviewKind(check.category === 'video' ? 'video' : check.category === 'audio' ? 'audio' : 'image');
    setPendingFile(file);
    startUpload(file);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleRetry = () => {
    if (pendingFile) startUpload(pendingFile);
  };

  return (
    <div style={{ marginBottom: 10 }}>

      {/* Upload Button */}
      <label
        style={{
          display: 'inline-block',
          padding: '10px 14px',
          background: uploading ? '#ccc' : '#1F6FEB',
          color: '#fff',
          borderRadius: 8,
          cursor: uploading ? 'not-allowed' : 'pointer',
          fontSize: 14,
          fontWeight: 500
        }}
      >
        {uploading ? `Uploading… ${progress}%` : label}

        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>

      {uploading && (
        <button
          type="button"
          onClick={handleCancel}
          style={{ marginLeft: 8, padding: '10px 12px', background: 'transparent', border: '1px solid #ccc', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
        >
          Cancel
        </button>
      )}

      {/* Progress bar */}
      {uploading && (
        <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: '#e6e9e6', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: '#1F6FEB',
              transition: 'width 150ms ease'
            }}
          />
        </div>
      )}

      {/* Error + retry */}
      {error && (
        <div style={{ marginTop: 6 }}>
          <p style={{ color: 'red', fontSize: '0.8rem', margin: 0 }}>{error}</p>
          {pendingFile && !uploading && (
            <button
              type="button"
              onClick={handleRetry}
              style={{ marginTop: 4, padding: '6px 10px', background: '#1F6FEB', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              Retry upload
            </button>
          )}
        </div>
      )}

      {/* Preview — tracked explicitly from the picked file's validated
          category, not sniffed from the blob: URL string (which never
          contains the file's type or name, so that check always failed
          silently and every video preview used to render as a broken
          image icon while uploading). */}
      {preview && previewKind === 'video' && (
        <video
          src={preview}
          controls
          style={{ width: 180, borderRadius: 8, border: '1px solid #ddd', marginTop: 10 }}
        />
      )}
      {preview && previewKind === 'audio' && (
        <audio src={preview} controls style={{ marginTop: 10, width: 220 }} />
      )}
      {preview && previewKind === 'image' && (
        <img
          src={preview}
          alt="preview"
          style={{ width: 140, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd', marginTop: 10 }}
        />
      )}
    </div>
  );
}
