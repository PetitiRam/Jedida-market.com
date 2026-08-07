import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import '../../styles/admin-roles.css';

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function StatCard({ label, value, foot }) {
  return (
    <div className="card-surface adm-stat-card">
      <div>
        <div className="adm-stat-label">{label}</div>
        <div className="adm-stat-value">{value}</div>
        {foot && <div className="adm-change-label">{foot}</div>}
      </div>
    </div>
  );
}

export default function AdminRolesPanel() {
  const [roleData, setRoleData] = useState(null); // { roles, areaLabels, totalAdmins }
  const [admins, setAdmins] = useState(null);
  const [activity, setActivity] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);

  const load = async () => {
    setError('');
    try {
      const [defsRes, adminsRes, activityRes, summaryRes] = await Promise.all([
        client.get('/admin/roles/definitions'),
        client.get('/admin/roles/admins'),
        client.get('/admin/roles/activity', { params: { limit: 12 } }),
        client.get('/admin/dashboard-summary').catch(() => ({ data: null })),
      ]);
      setRoleData(defsRes.data);
      setAdmins(adminsRes.data.admins || []);
      setActivity(activityRes.data.activity || []);
      setSummary(summaryRes.data);
    } catch {
      setError('Could not load the roles console. Check your connection and try again.');
      setAdmins([]);
      setActivity([]);
    }
  };
  useEffect(() => { load(); }, []);

  const roleByKey = useMemo(() => {
    const map = {};
    (roleData?.roles || []).forEach((r) => { map[r.role] = r; });
    return map;
  }, [roleData]);

  const roleLabel = (key) => roleByKey[key]?.label || (key ? key.replace(/_/g, ' ') : 'Super Admin');

  const highRiskAdminCount = useMemo(() => {
    if (!admins) return null;
    return admins.filter((a) => {
      const role = roleByKey[a.admin_role || 'super_admin'];
      return role && (role.risk === 'high' || role.risk === 'critical');
    }).length;
  }, [admins, roleByKey]);

  const adminsForRole = (roleKey) => (admins || []).filter((a) => (a.admin_role || 'super_admin') === roleKey);

  const revoke = async (id, name) => {
    if (!confirm(`Revoke admin access for ${name}? They will keep their regular account but lose all admin capabilities.`)) return;
    setBusyId(id);
    setError('');
    try {
      await client.post(`/admin/users/${id}/revoke-admin`);
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not revoke admin access for this user.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error && (
        <div className="card-surface" style={{ marginBottom: 12, background: '#fef3f2', border: '1px solid #fda29b', color: '#b42318', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button className="btn-link" onClick={load}>Retry</button>
        </div>
      )}

      {/* Live stats — every number below comes from the backend */}
      <div className="role-console-stats">
        <StatCard label="Total Users" value={summary ? summary.stats.users.total.toLocaleString() : '—'} />
        <StatCard label="Admins" value={roleData ? roleData.totalAdmins : (admins ? admins.length : '—')} />
        <StatCard
          label="Pending Role Upgrades"
          value={summary ? summary.pendingApprovals.upgrades : '—'}
          foot={summary?.pendingApprovals.upgrades ? 'View on the Upgrades tab' : undefined}
        />
        <StatCard
          label="High-Risk Admins"
          value={highRiskAdminCount === null ? '—' : highRiskAdminCount}
          foot={highRiskAdminCount ? 'Finance / Approvals / Security / Super Admin' : undefined}
        />
      </div>

      <div className="role-console-cols" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Role directory */}
          <div>
            <h3 style={{ marginBottom: 4 }}>Role directory</h3>
            <p className="product-card-meta" style={{ marginBottom: 12 }}>
              Every admin sub-role and the areas it grants access to — sourced directly from the same permission
              map the backend enforces. To grant a role, use the "Make Admin" bulk action on the Users tab.
            </p>
            {roleData === null ? (
              <div className="role-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card-surface" style={{ height: 90 }}>
                    <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 12, width: '90%' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="role-grid">
                {roleData.roles.map((r) => (
                  <div
                    key={r.role}
                    className={`card-surface role-card ${selectedRole === r.role ? 'selected' : ''}`}
                    onClick={() => setSelectedRole(selectedRole === r.role ? null : r.role)}
                  >
                    <div className="role-card-top">
                      <span className="role-card-name">{r.label}</span>
                      <span className={`risk-pill risk-${r.risk}`}>{r.risk}</span>
                    </div>
                    <div className="role-card-desc">{r.description}</div>
                    <div className="role-card-count">{r.adminCount} admin{r.adminCount === 1 ? '' : 's'} currently</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedRole && roleByKey[selectedRole] && (
            <div className="card-surface role-panel-detail">
              <h4>{roleByKey[selectedRole].label} — access</h4>
              <div>
                {roleByKey[selectedRole].areas.map((area) => (
                  <span key={area} className="area-chip">{roleData.areaLabels[area] || area}</span>
                ))}
              </div>
              <div className="product-card-meta" style={{ marginTop: 6 }}>Admins with this role</div>
              {adminsForRole(selectedRole).length === 0 ? (
                <div className="product-card-meta">No one currently holds this role.</div>
              ) : (
                adminsForRole(selectedRole).map((a) => (
                  <div key={a.id} className="product-card-meta">{a.full_name} · {a.email}</div>
                ))
              )}
            </div>
          )}

          {/* Admin directory */}
          <div>
            <h3 style={{ marginBottom: 4 }}>Admin directory</h3>
            <p className="product-card-meta" style={{ marginBottom: 12 }}>
              Everyone with admin access right now.
            </p>
            {admins === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="card-surface" style={{ display: 'flex', gap: 16 }}>
                    <div className="skeleton" style={{ height: 16, width: '40%' }} />
                    <div className="skeleton" style={{ height: 16, width: '30%' }} />
                  </div>
                ))}
              </div>
            ) : admins.length === 0 ? (
              <div className="empty-state">No admins found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {admins.map((a) => (
                  <div className="card-surface" key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <strong>{a.full_name}</strong> · {a.email}
                      <div className="product-card-meta">
                        <span className="product-card-badge">{roleLabel(a.admin_role)}</span>
                        {' — '}{roleByKey[a.admin_role || 'super_admin']?.description || 'Full access to every area.'}
                      </div>
                      <div className="product-card-meta">{a.granted_at ? `Granted ${new Date(a.granted_at).toLocaleDateString()}` : 'Granted before role tracking began'}</div>
                    </div>
                    <button className="btn-secondary" style={{ color: '#b42318', borderColor: '#fda29b' }} disabled={busyId === a.id} onClick={() => revoke(a.id, a.full_name)}>
                      Revoke access
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card-surface">
          <h3 style={{ marginBottom: 8 }}>Recent activity</h3>
          {activity === null ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : activity.length === 0 ? (
            <div className="empty-state">No role changes yet.</div>
          ) : (
            activity.map((ev) => (
              <div className="activity-row" key={ev.id}>
                <div className={`activity-dot ${ev.action}`}>{ev.action === 'granted' ? '✓' : '×'}</div>
                <div>
                  <div className="activity-text">
                    <strong>{ev.actorName}</strong>{' '}
                    {ev.action === 'granted' ? (
                      <>granted <strong>{roleLabel(ev.role)}</strong> to {ev.targetName}</>
                    ) : (
                      <>revoked admin access from {ev.targetName}</>
                    )}
                  </div>
                  <div className="activity-time">{timeAgo(ev.assignedAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
