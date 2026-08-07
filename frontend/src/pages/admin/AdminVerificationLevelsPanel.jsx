import { useEffect, useState } from 'react';
import client from '../../api/client';

const LEVELS = ['unverified', 'basic', 'verified', 'trusted', 'elite'];

function LevelRow({ b, onSaved }) {
  const [level, setLevel] = useState(b.verification_level);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await client.patch(`/admin/business-verification-levels/${b.id}`, { level, note });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>{b.company_name || b.username}</strong>
          <div className="product-card-meta">{b.business_type} · {b.username} ({b.email})</div>
        </div>
        <span className="product-card-badge">{b.verification_level}</span>
      </div>
      <div className="field-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <div className="field-group">
          <label>New level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the change…" />
        </div>
      </div>
      <button className="btn-primary" disabled={busy || level === b.verification_level} onClick={save}>
        {busy ? 'Saving…' : 'Update level'}
      </button>
    </div>
  );
}

export default function AdminVerificationLevelsPanel() {
  const [businesses, setBusinesses] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/admin/business-verification-levels', { params: { businessType: typeFilter || undefined } });
      setBusinesses(data.businesses || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [typeFilter]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['', 'manufacturer', 'supplier', 'dropshipper'].map((t) => (
          <button key={t || 'all'} className={typeFilter === t ? 'btn-primary' : 'btn-secondary'} onClick={() => setTypeFilter(t)}>
            {t || 'All'}
          </button>
        ))}
      </div>
      {loading && <div className="empty-state">Loading businesses…</div>}
      {!loading && businesses.length === 0 && <div className="empty-state">No active businesses found.</div>}
      {!loading && businesses.map((b) => <LevelRow key={b.id} b={b} onSaved={load} />)}
    </div>
  );
}
