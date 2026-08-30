import { useEffect, useState } from 'react';
import client from '../api/client';
import Icon from './icons/icon';

const STAGES = [
  { key: 'before_packaging', label: 'Before packaging', hint: 'Product condition, quantity, accessories' },
  { key: 'during_packaging', label: 'During packaging', hint: 'Items together, packaging material, sealing' },
  { key: 'after_packaging', label: 'After packaging', hint: 'Final sealed package' },
];

function StageColumn({ orderId, stage, evidence, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = evidence.filter((e) => e.stage === stage.key && !e.superseded_by);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setError('');
    const form = new FormData();
    form.append('image', file);
    form.append('stage', stage.key);
    try {
      await client.post(`/orders/${orderId}/packaging/evidence`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUploaded();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload this photo.');
    } finally { setBusy(false); }
  };

  return (
    <div className="card-surface" style={{ padding: 12 }}>
      <strong style={{ fontSize: '0.85rem' }}>{stage.label}</strong>
      <div style={{ fontSize: '0.76rem', color: '#8A968E', marginBottom: 10 }}>{stage.hint}</div>
      {error && <div className="alert alert-error" style={{ fontSize: '0.78rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {items.map((e) => (
          <img key={e.id} src={e.image_url} alt={e.caption || stage.label} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
        ))}
      </div>
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700,
        color: 'var(--forest)', border: '1.5px dashed var(--forest)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
      }}>
        <Icon name="plus" size={14} />
        {busy ? 'Uploading…' : 'Add photo'}
        <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
    </div>
  );
}

export default function PackagingEvidencePanel({ orderId, onClose }) {
  const [evidence, setEvidence] = useState([]);
  const [packagingStatus, setPackagingStatus] = useState('not_started');
  const [requirement, setRequirement] = useState(null);
  const [markingHanded, setMarkingHanded] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [evRes, reqRes] = await Promise.all([
      client.get(`/orders/${orderId}/packaging/evidence`),
      client.get(`/orders/${orderId}/packaging/requirements`).catch(() => ({ data: null })),
    ]);
    setEvidence(evRes.data.evidence || []);
    setPackagingStatus(evRes.data.packagingStatus);
    setRequirement(reqRes.data);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handToLogistics = async () => {
    setMarkingHanded(true); setError('');
    try {
      await client.post(`/orders/${orderId}/packaging/handed-to-logistics`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update packaging status.');
    } finally { setMarkingHanded(false); }
  };

  const STATUS_LABEL = {
    not_started: 'Not started', preparing: 'Preparing', packaging: 'Packaging',
    packed: 'Packed', handed_to_logistics: 'Handed to logistics',
  };

  return (
    <div className="card-surface" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong>Packaging evidence</strong>
        {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none' }}><Icon name="close" size={16} /></button>}
      </div>
      <div style={{ fontSize: '0.82rem', color: '#5B6760', marginBottom: 14 }}>
        Status: <strong>{STATUS_LABEL[packagingStatus]}</strong>
        {requirement && !requirement.meetsRequirement && (
          <span style={{ color: '#8A5A10' }}> — needs at least {requirement.minDuringPackagingPhotos} during-packaging photo{requirement.minDuringPackagingPhotos === 1 ? '' : 's'} ({requirement.uploadedDuringPackagingPhotos} uploaded)</span>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
        {STAGES.map((stage) => (
          <StageColumn key={stage.key} orderId={orderId} stage={stage} evidence={evidence} onUploaded={load} />
        ))}
      </div>

      {packagingStatus === 'packed' && (
        <button className="btn-primary" disabled={markingHanded} onClick={handToLogistics}>
          {markingHanded ? 'Updating…' : 'Mark handed to logistics'}
        </button>
      )}
      {packagingStatus === 'handed_to_logistics' && (
        <div style={{ fontSize: '0.82rem', color: 'var(--forest)', fontWeight: 700 }}>
          <Icon name="check" size={14} /> Handed to logistics
        </div>
      )}
    </div>
  );
}
