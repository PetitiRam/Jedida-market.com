import { useRef, useState } from 'react';
import client from '../../api/client';
import { compressImage } from '../../../utils/compressImage';
import { runOcr, extractIdFields } from '../../utils/ocr';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
const MAX_MB = 10; // configurable — surface from a settings endpoint if you need per-deployment limits

// Real, lightweight image-quality checks run against actual pixel data —
// not a stand-in for a trained "fake/edited document" detector. This
// catches obviously blurry/dark/tiny uploads before they waste an OCR
// pass; it does not verify document authenticity.
function quickQualityCheck(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const tooSmall = img.naturalWidth < 600 || img.naturalHeight < 400;

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  let edgeSum = 0;
  const stride = 4 * 20;
  let count = 0;
  for (let i = 0; i < data.length - stride; i += stride) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const lumNext = 0.299 * data[i + stride] + 0.587 * data[i + stride + 1] + 0.114 * data[i + stride + 2];
    sum += lum;
    edgeSum += Math.abs(lum - lumNext);
    count += 1;
  }
  const brightness = count ? sum / count : 0;
  const sharpness = count ? edgeSum / count : 0;

  return {
    tooSmall,
    tooDark: brightness < 40,
    tooBright: brightness > 235,
    blurry: sharpness < 4,
    passed: !tooSmall && brightness >= 40 && brightness <= 235 && sharpness >= 4,
  };
}

export default function DocumentUploadCard({ label, required, onExtracted, initialDoc }) {
  const inputRef = useRef(null);
  const [doc, setDoc] = useState(initialDoc || null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | uploading | ocr | done | error
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(null);
  const [error, setError] = useState('');

  const handleFile = async (file) => {
    setError('');
    if (!ACCEPTED.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
      setError('Please upload a JPG, PNG, HEIC, or PDF file.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_MB}MB.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setDoc({ previewUrl, name: file.name, size: file.size, url: null });
    setStatus('uploading');
    setProgress(0);

    try {
      let finalFile = file;
      let q = null;
      if (file.type.startsWith('image/')) {
        finalFile = await compressImage(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = previewUrl;
        });
        q = quickQualityCheck(img);
        setQuality(q);
      }

      const formData = new FormData();
      formData.append('file', finalFile);
      const { data } = await client.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      let extracted = null;
      if (file.type.startsWith('image/')) {
        setStatus('ocr');
        try {
          const { text, confidence } = await runOcr(finalFile, setProgress);
          extracted = extractIdFields(text);
          extracted.ocrConfidence = confidence;
        } catch (ocrErr) {
          console.error('OCR failed:', ocrErr);
          // OCR failing shouldn't block the upload itself — the document
          // is still attached, just without auto-filled fields.
        }
      }

      const finalDoc = { url: data.media.url, previewUrl, name: file.name, size: file.size, quality: q };
      setDoc(finalDoc);
      setStatus('done');
      onExtracted?.({ document: finalDoc, extracted });
    } catch (err) {
      console.error('Document upload error:', err);
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
      setStatus('error');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className={`kyc-upload-card ${dragOver ? 'drag-over' : ''} ${doc ? 'has-file' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="kyc-upload-card-head">
        <span className="kyc-upload-label">{label}{required && <span className="required-mark"> *</span>}</span>
        {status === 'done' && !error && <span className="kyc-badge kyc-badge-success">✓</span>}
      </div>

      {!doc ? (
        <button
          type="button"
          className="kyc-upload-dropzone"
          onClick={() => inputRef.current?.click()}
        >
          <span className="kyc-upload-icon">📄</span>
          <span>Drag & drop or tap to upload</span>
          <span className="kyc-upload-hint">JPG, PNG, HEIC, or PDF · up to {MAX_MB}MB</span>
        </button>
      ) : (
        <div className="kyc-upload-preview">
          {doc.previewUrl && !doc.name?.toLowerCase().endsWith('.pdf') ? (
            <img src={doc.previewUrl} alt={label} />
          ) : (
            <div className="kyc-upload-file-icon">📄 {doc.name}</div>
          )}
          <div className="kyc-upload-meta">
            <span>{doc.name}</span>
            {doc.size && <span>{(doc.size / (1024 * 1024)).toFixed(1)} MB</span>}
          </div>
          <div className="kyc-upload-actions">
            <button type="button" className="btn-link" onClick={() => inputRef.current?.click()}>Replace</button>
            <button type="button" className="btn-link btn-danger" onClick={() => { setDoc(null); setStatus('idle'); setQuality(null); }}>Remove</button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {status === 'uploading' && <div className="kyc-status-line">Uploading…</div>}
      {status === 'ocr' && <div className="kyc-status-line">Reading document… {progress}%</div>}
      {quality && status !== 'uploading' && (
        <div className={`kyc-quality-check ${quality.passed ? 'ok' : 'warn'}`}>
          {quality.passed
            ? '✓ Image quality looks good'
            : `⚠ ${[quality.tooSmall && 'resolution is low', quality.blurry && 'image looks blurry',
                quality.tooDark && 'image is too dark', quality.tooBright && 'image is overexposed']
                .filter(Boolean).join(', ')}`}
        </div>
      )}
      {error && <div className="kyc-status-line kyc-status-error">{error}</div>}
    </div>
  );
}
