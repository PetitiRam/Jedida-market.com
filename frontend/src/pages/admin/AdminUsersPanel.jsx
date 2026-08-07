import { useEffect, useState } from 'react';
import client from '../../api/client';

const ADMIN_ROLES = [
  { value: '', label: 'Full admin (all access)' },
  { value: 'staff', label: 'Staff' },
  { value: 'moderator', label: 'Moderator (products, shops, users)' },
  { value: 'support', label: 'Support (chat, users)' },
  { value: 'finance', label: 'Finance (wallets, withdrawals, payments)' },
  { value: 'marketing', label: 'Marketing (ads, campaigns)' },
  { value: 'approvals', label: 'Approvals (products, shops, upgrades, withdrawals)' },
  { value: 'ai_manager', label: 'AI Manager' },
  { value: 'chat_assistant', label: 'Chat Assistant' },
];

const PAGE_SIZE = 50;

function toCsv(users) {
  const header = ['User #', 'Name', 'Username', 'Email', 'Phone', 'Country', 'Role', 'Verified', 'Status', 'KYC', 'Admin Role', 'Registered'];
  const rows = users.map((u) => [
    u.user_number, u.full_name, u.username || '', u.email, u.phone_number || '', u.location_country || '',
    u.primary_role, u.is_verified ? 'Yes' : 'No', u.status, u.kyc_status,
    u.admin_role || (u.is_admin ? 'full' : ''), new Date(u.created_at).toISOString(),
  ]);
  return [header, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function UserDetailModal({ userId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    client.get(`/admin/users/${userId}`)
      .then(({ data }) => setDetail(data))
      .catch(() => setError('Could not load this user\u2019s profile. Please try again.'));
  }, [userId]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,22,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto', zIndex: 1000 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card-surface" style={{ maxWidth: 560, width: '100%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#f3f3f3', cursor: 'pointer' }}>✕</button>
        {error ? <div className="empty-state" style={{ color: '#b42318' }}>{error}</div> : !detail ? <div className="empty-state">Loading…</div> : (
          <>
            <h3>{detail.user.full_name}</h3>
            <p className="product-card-meta">
              User #{detail.user.user_number} · @{detail.user.username} · {detail.user.email} · {detail.user.phone_number || 'no phone'}
            </p>
            <p className="product-card-meta">
              {detail.user.primary_role} · {detail.user.is_verified ? 'Verified' : 'Not verified'} · KYC: {detail.user.kyc_status} · Status: {detail.user.status}
            </p>
            <p className="product-card-meta">
              {detail.user.location_city}{detail.user.location_city && detail.user.location_country ? ', ' : ''}{detail.user.location_country}
            </p>
            <p className="product-card-meta">Registered {new Date(detail.user.created_at).toLocaleDateString()}</p>

            {detail.shop && (
              <div style={{ marginTop: 12 }}>
                <h4>Shop</h4>
                <p className="product-card-meta">{detail.shop.name} ({detail.shop.status})</p>
              </div>
            )}

            {detail.upgrades.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4>Upgrade requests</h4>
                {detail.upgrades.map((u) => (
                  <p key={u.id} className="product-card-meta">
                    → {u.requested_role}: {u.status.replace(/_/g, ' ')} ({new Date(u.created_at).toLocaleDateString()})
                  </p>
                ))}
              </div>
            )}

            {detail.kycDocuments.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h4>KYC submissions</h4>
                {detail.kycDocuments.map((k) => (
                  <p key={k.id} className="product-card-meta">
                    {k.status} — submitted {new Date(k.created_at).toLocaleDateString()}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminUsersPanel() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adminRoleToGrant, setAdminRoleToGrant] = useState('');
  const [detailUserId, setDetailUserId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/admin/users', {
        params: { role: roleFilter || undefined, search: search || undefined, page, pageSize: PAGE_SIZE }
      });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load users. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [roleFilter, page]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 350); // debounce search
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const clearSelection = () => setSelected([]);

  const makeAdmin = async () => {
    if (!confirm(`Make ${selected.length} user(s) admin${adminRoleToGrant ? ` (${adminRoleToGrant})` : ''}?`)) return;
    setBusy(true);
    setError('');
    try {
      await Promise.all(selected.map((id) => client.post(`/admin/users/${id}/make-admin`, { role: adminRoleToGrant || undefined })));
      clearSelection();
      await load();
    } catch {
      setError('Could not update admin roles for one or more users. Nothing was changed for the failed ones — please retry.');
    } finally {
      setBusy(false);
    }
  };

  const makeSeller = async () => {
    if (!confirm(`Convert ${selected.length} user(s) to sellers?`)) return;
    setBusy(true);
    setError('');
    try {
      await Promise.all(selected.map((id) => client.patch(`/admin/users/${id}/status`, { role: 'seller' })));
      clearSelection();
      await load();
    } catch {
      setError('Could not convert one or more users to seller. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (userId, status) => {
    setError('');
    try {
      await client.patch(`/admin/users/${userId}/status`, { status });
      await load();
    } catch {
      setError('Could not update that user\u2019s status. Please retry.');
    }
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(sortedUsers)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jedida-users-page${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedUsers = [...users].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const Th = ({ label, sortField }) => (
    <th
      onClick={() => sortField && toggleSort(sortField)}
      style={{ cursor: sortField ? 'pointer' : 'default', textAlign: 'left', padding: '8px 10px', position: 'sticky', top: 0, background: '#fff', borderBottom: '2px solid var(--line)', whiteSpace: 'nowrap' }}
    >
      {label}{sortField && sortKey === sortField ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div>
      {error && (
        <div className="card-surface" style={{ marginBottom: 12, background: '#fef3f2', border: '1px solid #fda29b', color: '#b42318', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button className="btn-link" onClick={load}>Retry</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div className="field-group" style={{ maxWidth: 220 }}>
          <label>Filter by role</label>
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="field-group" style={{ maxWidth: 280 }}>
          <label>Search (name, email, phone, #)</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" />
        </div>
        <button className="btn-secondary" onClick={exportCsv} disabled={users.length === 0}>⬇ Export CSV</button>
      </div>

      {selected.length > 0 && (
        <div className="card-surface" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>{selected.length} selected</strong>
          <select value={adminRoleToGrant} onChange={(e) => setAdminRoleToGrant(e.target.value)} style={{ maxWidth: 260 }}>
            {ADMIN_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="btn-primary" disabled={busy} onClick={makeAdmin}>Make Admin</button>
          <button className="btn-secondary" disabled={busy} onClick={makeSeller}>Convert to Seller</button>
          <button className="btn-link" onClick={clearSelection}>Clear</button>
        </div>
      )}

      <div style={{ overflowX: 'auto', maxHeight: '65vh', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '2px solid var(--line)' }}></th>
                <Th label="#" sortField="user_number" />
                <Th label="Name" sortField="full_name" />
                <Th label="Email" sortField="email" />
                <Th label="Phone" />
                <Th label="Country" sortField="location_country" />
                <Th label="Role" sortField="primary_role" />
                <Th label="Verified" />
                <Th label="Status" sortField="status" />
                <Th label="KYC" sortField="kyc_status" />
                <Th label="Registered" sortField="created_at" />
                <Th label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} style={{ borderBottom: '1px solid var(--line)' }}>
                    {Array.from({ length: 11 }).map((__, j) => (
                      <td key={j} style={{ padding: '10px' }}>
                        <div className="skeleton" style={{ height: 12, width: j === 2 ? '80%' : j === 3 ? '90%' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedUsers.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center' }} className="product-card-meta">No users match these filters.</td></tr>
              ) : sortedUsers.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleSelect(u.id)} />
                  </td>
                  <td style={{ padding: '8px 10px' }}>{u.user_number}</td>
                  <td style={{ padding: '8px 10px', cursor: 'pointer', color: 'var(--forest)' }} onClick={() => setDetailUserId(u.id)}>
                    <strong>{u.full_name}</strong>
                    {u.is_admin && (
                      <span className="product-card-badge" style={{ marginLeft: 6, fontSize: '0.7rem' }}>
                        {u.admin_role ? u.admin_role.replace('_', ' ') : 'admin'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{u.email}</td>
                  <td style={{ padding: '8px 10px' }}>{u.phone_number || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{u.location_country || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{u.primary_role}</td>
                  <td style={{ padding: '8px 10px' }}>{u.is_verified ? '✅' : '—'}</td>
                  <td style={{ padding: '8px 10px' }}><span className={`status-chip status-${u.status}`}>{u.status}</span></td>
                  <td style={{ padding: '8px 10px' }}>{u.kyc_status}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {u.status !== 'suspended' ? (
                      <button className="btn-secondary" onClick={() => setStatus(u.id, 'suspended')}>Suspend</button>
                    ) : (
                      <button className="btn-secondary" onClick={() => setStatus(u.id, 'active')}>Reactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span className="product-card-meta">{total} users total</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="product-card-meta">Page {page} of {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      </div>

      {detailUserId && <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} />}
    </div>
  );
}
