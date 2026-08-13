import { useRef, useState } from 'react';
import { uploadFormData, timeoutForFileSize } from '../../api/client';
import { compressImage } from '../../utils/compressImage';
import { validateFileForUpload } from '../../utils/uploadValidation';

// Drag-and-drop (web) + tap-to-upload (mobile) media dropzone for product
// listings. Uses the same /uploads endpoint and compressImage utility as
// the existing MediaUploader component — no backend or API changes.
export default function ProductMediaDropzone({ onUploaded, onError, maxItems = 10, currentCount = 0 }) {
  const [dragging, setDragging] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [progressByFile, setProgressByFile] = useState({});
  const inputRef = useRef(null);

  const remainingSlots = Math.max(0, maxItems - currentCount);

  const avgProgress = () => {
    const values = Object.values(progressByFile);
    if (!values.length) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  const uploadOne = async (file, key) => {
    let finalFile = file;
    try {
      if (file.type.startsWith('image/')) {
        finalFile = await compressImage(file);
      }
      const formData = new FormData();
      formData.append('file', finalFile);
      // uploadFormData deliberately never sets Content-Type manually — see
      // MediaUploader.jsx / api/client.js for why that breaks multipart
      // parsing on the server — and scales its timeout to the file's
      // actual size instead of one fixed number, since a product video
      // can be many times larger than a photo.
      const { data } = await uploadFormData('/uploads', formData, {
        timeout: timeoutForFileSize(finalFile.size),
        onUploadProgress: (evt) => {
          if (evt.total) {
            setProgressByFile((prev) => ({ ...prev, [key]: Math.round((evt.loaded / evt.total) * 100) }));
          }
        }
      });
      onUploaded({
        type: file.type.startsWith('video/') ? 'video' : 'image',
        url: data.media.url
      });
    } catch (err) {
      onError?.(err.friendlyMessage || err.response?.data?.error || `Could not upload ${file.name}.`);
    } finally {
      setProgressByFile((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleFiles = async (fileList) => {
    const allFiles = Array.from(fileList || []);
    if (allFiles.length === 0) return;

    // Validate every file up front — before starting any upload — so an
    // oversized or unsupported file (a 70MB video, a screen recording in
    // an unsupported container) gets a clear, instant message instead of
    // failing minutes into an upload, or silently eating one of the
    // person's limited media slots.
    const valid = [];
    for (const file of allFiles.slice(0, remainingSlots)) {
      const check = validateFileForUpload(file, ['image', 'video']);
      if (!check.ok) {
        onError?.(`${file.name}: ${check.error}`);
        continue;
      }
      valid.push(file);
    }
    if (allFiles.length > remainingSlots) {
      onError?.(`You can upload up to ${maxItems} media files — only the first ${remainingSlots} were queued.`);
    }
    if (valid.length === 0) return;

    setUploadingCount((c) => c + valid.length);
    await Promise.all(valid.map((file, i) => uploadOne(file, `${file.name}-${file.size}-${i}-${Date.now()}`)));
    setUploadingCount((c) => Math.max(0, c - valid.length));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (remainingSlots <= 0) {
      onError?.(`You can upload up to ${maxItems} media files.`);
      return;
    }
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`apf-dropzone${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
    >
      <div className="apf-dz-icon">📤</div>
      <div className="apf-dz-title">
        {uploadingCount > 0 ? `Uploading ${uploadingCount}… ${avgProgress()}%` : 'Drag & drop photos or video here'}
      </div>
      {uploadingCount > 0 && (
        <div style={{ width: '100%', maxWidth: 260, height: 4, borderRadius: 2, background: '#e6e9e6', overflow: 'hidden', margin: '6px auto 0' }}>
          <div style={{ height: '100%', width: `${avgProgress()}%`, background: '#1F6FEB', transition: 'width 150ms ease' }} />
        </div>
      )}
      <div className="apf-dz-sub">
        or tap to browse · JPG, PNG, WEBP or MP4 · {remainingSlots} of {maxItems} slots left
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
