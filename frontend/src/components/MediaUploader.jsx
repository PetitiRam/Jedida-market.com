import { useState } from 'react';
import client from '../api/client';
import { compressImage } from '../../utils/compressImage';
export default function MediaUploader({
  onUploaded,
  accept = 'image/*,video/*',
  label = 'Upload image or video'
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setUploading(true);

    try {
      // 🖼 Instant preview (before upload)
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);

      let finalFile = file;

      // ⚡ Compress only images
      if (file.type.startsWith('image/')) {
        finalFile = await compressImage(file);
      }

      const formData = new FormData();
      formData.append('file', finalFile);

      const { data } = await client.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // cleanup preview after success
      setPreview(null);

      onUploaded({
        ...data.media,
        previewUrl
      });

    } catch (err) {
      console.error('Upload error:', err);
      setError(
        err.response?.data?.error ||
        'Upload failed. Try again or use a URL instead.'
      );
      setPreview(null);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const isVideo = (fileType) => fileType?.startsWith('video/');

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
        {uploading ? 'Uploading...' : label}

        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>

      {/* Error */}
      {error && (
        <p style={{ color: 'red', fontSize: '0.8rem', marginTop: 6 }}>
          {error}
        </p>
      )}

      {/* Instant Preview */}
      {preview && (
        <div style={{ marginTop: 10 }}>
          {preview.includes('video') ? (
            <video
              src={preview}
              controls
              style={{
                width: 140,
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          ) : (
            <img
              src={preview}
              alt="preview"
              style={{
                width: 140,
                height: 120,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
