import { useEffect, useState } from 'react';
import * as sourcingApi from '../../api/sourcingApi';

export default function MyImportsPanel() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await sourcingApi.myImports();
      setImports(data.imports || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveMargin = async (imp) => {
    await sourcingApi.updateImport(imp.id, {
      marginType: editing.marginType,
      marginValue: Number(editing.marginValue),
      resync: true,
    });
    setEditing(null);
    load();
  };

  const toggleSync = async (imp) => {
    await sourcingApi.updateImport(imp.id, { syncEnabled: !imp.sync_enabled });
    load();
  };

  const remove = async (imp) => {
    if (!confirm('Remove this import? The listing in your shop will be paused.')) return;
    await sourcingApi.removeImport(imp.id);
    load();
  };

  if (loading) return <div className="empty-state">Loading your imports…</div>;
  if (imports.length === 0) {
    return <div className="empty-state">You haven't imported any products yet — browse the Sourcing catalog to get started.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {imports.map((imp) => (
        <div key={imp.id} className="product-card" style={{ padding: 16 }}>
          <div className="product-card-title">{imp.imported_title}</div>
          <div className="product-card-meta">Sourced from: {imp.source_title}</div>
          <div className="product-card-price">
            {Number(imp.imported_price).toLocaleString()}
            <span className={`status-chip status-${imp.status}`} style={{ marginLeft: 8 }}>{imp.status}</span>
          </div>
          <div className="product-card-meta">
            Margin: {imp.margin_type === 'percent' ? `${imp.margin_value}%` : `+${imp.margin_value} flat`}
            {imp.last_synced_at && <> · Last synced {new Date(imp.last_synced_at).toLocaleString()}</>}
          </div>

          {editing?.id === imp.id ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <select
                value={editing.marginType}
                onChange={(e) => setEditing((ed) => ({ ...ed, marginType: e.target.value }))}
              >
                <option value="percent">Margin %</option>
                <option value="fixed">Fixed markup</option>
              </select>
              <input
                type="number"
                value={editing.marginValue}
                onChange={(e) => setEditing((ed) => ({ ...ed, marginValue: e.target.value }))}
                style={{ width: 100 }}
              />
              <button className="btn-primary" onClick={() => saveMargin(imp)}>Save</button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                className="btn-secondary"
                onClick={() => setEditing({ id: imp.id, marginType: imp.margin_type, marginValue: imp.margin_value })}
              >
                Edit Margin
              </button>
              <button className="btn-secondary" onClick={() => toggleSync(imp)}>
                {imp.sync_enabled ? 'Pause Sync' : 'Resume Sync'}
              </button>
              <button className="btn-secondary" onClick={() => remove(imp)}>Remove Import</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
