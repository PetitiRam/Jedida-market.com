import { useState } from 'react';
import Icon from '../icons/icon';
import { uploadPartnerDocument } from '../../api/partnersApi';

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp';
const MAX_BYTES = 15 * 1024 * 1024;

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PartnerDocumentUploader({ docType, label, required, value, onChange }) {
  const [status, setStatus] = useState('idle'); // idle | uploading | success | error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (file.size > MAX_BYTES) {
      setError('File too large. Max size is 15MB.');
      setStatus('error');
      e.target.value = '';
      return;
    }

    setStatus('uploading');
    setProgress(0);

    try {
      const { data } = await uploadPartnerDocument(file, docType, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      setStatus('success');
      onChange(data.document);
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      e.target.value = '';
    }
  };

  const clear = () => {
    onChange(null);
    setStatus('idle');
    setProgress(0);
    setError('');
  };

  return (
    <div className={`jd-partner-doc ${status}`}>
      <div className="jd-partner-doc-info">
        <span className="jd-partner-doc-icon"><Icon name={value ? 'fileCheck' : 'document'} size={18} /></span>
        <div>
          <div className="jd-partner-doc-label">
            {label} {required && <span className="jd-partner-doc-required">*</span>}
          </div>
          {value && <div className="jd-partner-doc-filename">{value.fileName} {value.bytes ? `· ${formatBytes(value.bytes)}` : ''}</div>}
          {status === 'uploading' && (
            <div className="jd-partner-doc-progress-track">
              <div className="jd-partner-doc-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && <div className="jd-partner-doc-error"><Icon name="x" size={12} /> {error}</div>}
        </div>
      </div>

      <div className="jd-partner-doc-action">
        {value ? (
          <button type="button" className="jd-partner-doc-remove" onClick={clear} aria-label={`Remove ${label}`}>
            <Icon name="x" size={15} />
          </button>
        ) : (
          <label className="jd-partner-doc-upload-btn">
            {status === 'uploading' ? (
              <><Icon name="loader" size={15} className="jd-btn-spin" /> {progress}%</>
            ) : (
              <><Icon name="upload" size={15} /> Upload</>
            )}
            <input type="file" accept={ACCEPT} onChange={handleChange} disabled={status === 'uploading'} />
          </label>
        )}
      </div>
    </div>
  );
}
