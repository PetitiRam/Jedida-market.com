import { useEffect, useState } from 'react';
import * as api from '../settingsCenterApi';
import { SectionCard, SaveFeedback, useSaveState, Toggle } from '../settingsCenterUI';

function AboutSystem() {
  const [info, setInfo] = useState(null);
  useEffect(() => { api.getSystemInfo().then(({ data }) => setInfo(data.info)); }, []);

  if (!info) return <div className="empty-state">Loading system info…</div>;

  const rows = [
    ['Application version', info.applicationVersion],
    ['Database version', info.databaseVersion],
    ['API version', info.apiVersion],
    ['Node.js version', info.nodeVersion],
    ['Environment', info.environment],
    ['Server uptime', `${Math.floor(info.serverUptimeSeconds / 3600)}h ${Math.floor((info.serverUptimeSeconds % 3600) / 60)}m`],
    ['Database storage usage', info.storageUsage]
  ];

  return (
    <SectionCard title="About System" description="Read-only, live-computed system information.">
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="product-card-meta">{label}</span>
          <strong style={{ fontSize: '0.9rem' }}>{value}</strong>
        </div>
      ))}
    </SectionCard>
  );
}

function BackupMaintenance() {
  const [backups, setBackups] = useState(null);
  const [maintenance, setMaintenance] = useState(null);
  const backupState = useSaveState();
  const maintenanceState = useSaveState();

  const loadBackups = () => api.listBackups().then(({ data }) => setBackups(data.backups));
  const loadMaintenance = () => api.getSection('maintenance').then(({ data }) => setMaintenance(data.value));

  useEffect(() => { loadBackups(); loadMaintenance(); }, []);

  const runBackup = () => backupState.run(async () => { await api.createBackup(); await loadBackups(); });
  const saveMaintenance = (e) => { e.preventDefault(); maintenanceState.run(() => api.updateSection('maintenance', maintenance)); };

  return (
    <>
      <SaveFeedback message={backupState.message} />
      <SectionCard title="Backup & Maintenance" description="Database backups are created via pg_dump on the server and logged below.">
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }} disabled={backupState.saving} onClick={runBackup}>
          {backupState.saving ? 'Creating backup…' : '💾 Create backup now'}
        </button>

        <div style={{ marginTop: 16 }}>
          {backups === null ? (
            <div className="empty-state">Loading backup history…</div>
          ) : backups.length === 0 ? (
            <p className="product-card-meta">No backups created yet.</p>
          ) : (
            backups.map((b) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '0.85rem' }}>
                <span>{b.action} — {new Date(b.created_at).toLocaleString()}</span>
                <span className={`status-chip ${b.status === 'completed' ? 'status-active' : 'status-rejected'}`}>{b.status}</span>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {maintenance && (
        <>
          <SaveFeedback message={maintenanceState.message} />
          <SectionCard title="Maintenance Mode" description="When enabled, all non-admin users see the maintenance message instead of the app.">
            <form onSubmit={saveMaintenance}>
              <Toggle checked={maintenance.maintenanceMode} onChange={(v) => setMaintenance({ ...maintenance, maintenanceMode: v })} label="Enable maintenance mode" />
              <div className="field-group" style={{ marginTop: 10 }}>
                <label>Maintenance message shown to visitors</label>
                <textarea rows={2} value={maintenance.maintenanceMessage} onChange={(e) => setMaintenance({ ...maintenance, maintenanceMessage: e.target.value })} />
              </div>
              <button className="btn-primary" disabled={maintenanceState.saving}>{maintenanceState.saving ? 'Saving…' : 'Save maintenance settings'}</button>
            </form>
          </SectionCard>
        </>
      )}
    </>
  );
}

export default function AboutBackupTab() {
  return (
    <div>
      <BackupMaintenance />
      <AboutSystem />
    </div>
  );
}
