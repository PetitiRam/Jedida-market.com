import { useRef, useState } from 'react';
import client from '../../api/client';
import { compressImage } from '../../utils/compressImage';

// Drag-and-drop (web) + tap-to-upload (mobile) media dropzone for product
// listings. Uses the same /uploads endpoint and compressImage utility as
// the existing MediaUploader component — no backend or API changes.
export default function ProductMediaDropzone({ onUploaded, onError, maxItems = 10, currentCount = 0 }) {
  const [dragging, setDragging] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const inputRef = useRef(null);

  const remainingSlots = Math.max(0, maxItems - currentCount);

  const uploadOne = async (file) => {
    let finalFile = file;
    try {
      if (file.type.startsWith('image/')) {
        finalFile = await compressImage(file);
      }
      const formData = new FormData();
      formData.append('file', finalFile);
      const { data } = await client.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUploaded({
        type: file.type.startsWith('video/') ? 'video' : 'image',
        url: data.media.url
      });
    } catch (err) {
      onError?.(err.response?.data?.error || `Could not upload ${file.name}.`);
    }
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).slice(0, remainingSlots);
    if (files.length === 0) return;
    setUploadingCount((c) => c + files.length);
    await Promise.all(files.map(uploadOne));
    setUploadingCount((c) => Math.max(0, c - files.length));
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
        {uploadingCount > 0 ? `Uploading ${uploadingCount}…` : 'Drag & drop photos or video here'}
      </div>
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
