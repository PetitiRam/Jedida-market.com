import { useEffect, useState } from 'react';
import { getAuditLog } from '../../api/partnerPortalApi';

export default function AuditLogPanel() {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    getAuditLog({ page, pageSize }).then(({ data }) => { setEntries(data.entries); setTotal(data.total); });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="jd-portal-card">
      <div className="jd-portal-card-head">
        <div>
          <div className="jd-portal-card-title">Activity History</div>
          <div className="jd-portal-card-sub">Profile updates, API key changes, webhook changes, security changes, logins, and support activity</div>
        </div>
      </div>
      {entries.length === 0 && <div className="empty-state">No activity recorded yet.</div>}
      {entries.map((entry) => (
        <div key={entry.id} className="jd-portal-log-row">
          <strong>{entry.action.replace(/_/g, ' ')}</strong>
          <div className="jd-portal-log-meta">{entry.actor_role} · {new Date(entry.created_at).toLocaleString()}</div>
          {entry.details && Object.keys(entry.details).length > 0 && (
            <div className="jd-portal-log-json">{JSON.stringify(entry.details, null, 2)}</div>
          )}
        </div>
      ))}
      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <span className="jd-portal-card-sub">Page {page} of {totalPages}</span>
          <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <button className="btn-secondary" style={{ width: 'auto', padding: '6px 14px' }} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
