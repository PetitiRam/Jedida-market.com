import { useState } from 'react';

export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
      <span style={{
        position: 'relative', width: 40, height: 22, borderRadius: 999,
        background: checked ? 'var(--forest)' : 'var(--line)', transition: 'background 0.15s', flexShrink: 0
      }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', 
margin: 0, cursor: 'pointer' }} />
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }} />
      </span>
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
    </label>
  );
}

export function SectionCard({ title, description, children }) {
  return (
    <div className="card-surface" style={{ marginBottom: 20 }}>
      <h4 style={{ marginBottom: 4 }}>{title}</h4>
      {description && <p className="product-card-meta" style={{ marginBottom: 14 }}>{description}</p>}
      {children}
    </div>
  );
}

export function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const run = async (fn) => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await fn();
      setMessage({ type: 'success', text: 'Saved successfully.' });
      return result;
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Could not save changes.' });
      throw err;
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return { saving, message, run };
}

export function SaveFeedback({ message }) {
  if (!message) return null;
  return <div className={`alert alert-${message.type === 'error' ? 'error' : 'success'}`}>{message.text}</div>;
}

export function ImageFieldPreview({ url, onDelete, label }) {
  if (!url) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
      <img src={url} alt={label} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
      <button type="button" className="btn-link" onClick={onDelete}>Remove {label}</button>
    </div>
  );
}
