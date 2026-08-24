import { useEffect, useMemo, useState } from 'react';
import client from '../../api/client';

// Admin configuration screen for the Agent Communication Center's
// sectors/groups (schema_phase83 + agentCommsService.js). Deliberately
// built in the SAME light admin-shell visual language as
// AdminRolesPanel.jsx (card-surface / btn-primary / btn-secondary from
// theme.css) rather than the dark "jcc" operations theme — this is an
// admin configuration screen, same family as Roles & Permissions, not
// an agent workspace like the Command Center. Registered as its own
// AdminPanel tab (area: 'chat', same permission area as the Command
// Center) rather than folded into JedidaCommandCenter, since it's a
// distinct workflow (occasional setup vs. constant live chat use).

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

function StatCard({ label, value }) {
  return (
    <div className="card-surface" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 12, color: '#5B6760', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--forest)' }}>{value}</div>
    </div>
  );
}

export default function AgentGroupsPanel() {
  const [sectors, setSectors] = useState([]);
  const [groups, setGroups] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const [sectorForm, setSectorForm] = useState({ name: '', description: '' });
  const [groupForm, setGroupForm] = useState({ name: '', sectorId: '', description: '' });
  const [addMemberAgentId, setAddMemberAgentId] = useState('');

  async function load() {
    setError('');
    try {
      const [sectorsRes, groupsRes, agentsRes] = await Promise.all([
        client.get('/agent-comms/sectors'),
        client.get('/agent-comms/groups'),
        client.get('/agent-comms/agents'),
      ]);
      setSectors(sectorsRes.data.sectors || []);
      setGroups(groupsRes.data.groups || []);
      setAgents(agentsRes.data.agents || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load agent groups. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const selectedGroup = useMemo(() => groups.find((g) => g.id === selectedGroupId) || null, [groups, selectedGroupId]);

  // Group membership isn't in the /groups list response (that only has a
  // count) — fetch the member roster for whichever group is selected.
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  useEffect(() => {
    if (!selectedGroupId) { setMembers([]); return; }
    setMembersLoading(true);
    client.get('/agent-comms/agents', { params: { groupId: selectedGroupId } })
      .then(({ data }) => setMembers(data.agents || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [selectedGroupId, groups]);

  async function createSector(e) {
    e.preventDefault();
    if (!sectorForm.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await client.post('/agent-comms/sectors', { name: sectorForm.name.trim(), description: sectorForm.description.trim() || undefined });
      setSectorForm({ name: '', description: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create sector.');
    } finally { setBusy(false); }
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await client.post('/agent-comms/groups', {
        name: groupForm.name.trim(),
        sectorId: groupForm.sectorId || undefined,
        description: groupForm.description.trim() || undefined,
      });
      setGroupForm({ name: '', sectorId: '', description: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create group.');
    } finally { setBusy(false); }
  }

  async function toggleAutoAssignment(group) {
    setBusy(true);
    setError('');
    try {
      await client.patch(`/agent-comms/groups/${group.id}`, { auto_assignment_enabled: !group.auto_assignment_enabled });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update this group.');
    } finally { setBusy(false); }
  }

  async function addMember(e) {
    e.preventDefault();
    if (!addMemberAgentId || !selectedGroupId) return;
    setBusy(true);
    setError('');
    try {
      await client.post(`/agent-comms/groups/${selectedGroupId}/members`, { agentId: addMemberAgentId });
      setAddMemberAgentId('');
      const { data } = await client.get('/agent-comms/agents', { params: { groupId: selectedGroupId } });
      setMembers(data.agents || []);
      await load(); // refresh member_count on the group list
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this agent to the group.');
    } finally { setBusy(false); }
  }

  async function removeMember(agentId, name) {
    if (!confirm(`Remove ${name} from this group? They'll stop receiving conversations routed here.`)) return;
    setBusy(true);
    setError('');
    try {
      await client.delete(`/agent-comms/groups/${selectedGroupId}/members/${agentId}`);
      setMembers((prev) => prev.filter((m) => m.id !== agentId));
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove this agent.');
    } finally { setBusy(false); }
  }

  const agentsNotInGroup = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    return agents.filter((a) => !memberIds.has(a.id));
  }, [agents, members]);

  if (loading) return <div className="card-surface">Loading agent groups…</div>;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4 }}>Agent Groups &amp; Sectors</h2>
        <div style={{ color: '#5B6760', fontSize: 14 }}>
          Configure the sectors and teams conversations route to in the Command Center. Nothing here is hard-coded —
          create as many sectors and groups as the business needs.
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button className="btn-link" onClick={load}>Retry</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Sectors" value={sectors.length} />
        <StatCard label="Groups" value={groups.length} />
        <StatCard label="Agents" value={agents.length} />
        <StatCard label="Auto-Routed Groups" value={groups.filter((g) => g.auto_assignment_enabled).length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Groups list */}
          <div className="card-surface">
            <h3 style={{ marginBottom: 12 }}>Groups</h3>
            {groups.length === 0 && <div style={{ color: '#5B6760', fontSize: 13.5 }}>No groups yet — create one below.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  style={{
                    textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${selectedGroupId === g.id ? 'var(--forest)' : 'var(--line)'}`,
                    background: selectedGroupId === g.id ? 'rgba(11,61,36,0.05)' : '#fff', cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: '#5B6760' }}>{g.sector_name || 'No sector'} · {g.member_count} agent{g.member_count === '1' ? '' : 's'}</div>
                  </div>
                  {g.auto_assignment_enabled && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--terracotta)', background: '#E3F0E5', padding: '3px 8px', borderRadius: 999 }}>AUTO-ROUTE</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Create group form */}
          <div className="card-surface">
            <h3 style={{ marginBottom: 12 }}>Create a Group</h3>
            <form onSubmit={createGroup} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Group name (e.g. Property – Entebbe Team)" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} required />
              <select value={groupForm.sectorId} onChange={(e) => setGroupForm({ ...groupForm, sectorId: e.target.value })}>
                <option value="">No sector</option>
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <textarea rows={2} placeholder="Description (optional)" value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} />
              <button className="btn-primary" type="submit" disabled={busy || !groupForm.name.trim()} style={{ width: 'auto', padding: '10px 20px' }}>Create Group</button>
            </form>
          </div>

          {/* Sectors list + create */}
          <div className="card-surface">
            <h3 style={{ marginBottom: 12 }}>Sectors</h3>
            {sectors.length === 0 && <div style={{ color: '#5B6760', fontSize: 13.5, marginBottom: 10 }}>No sectors yet.</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {sectors.map((s) => (
                <span key={s.id} style={{ fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999, border: '1.5px solid var(--line)', background: '#fff' }}>
                  {s.name} · {groups.filter((g) => g.sector_id === s.id).length} groups
                </span>
              ))}
            </div>
            <form onSubmit={createSector} style={{ display: 'flex', gap: 8 }}>
              <input placeholder="New sector name (e.g. B2B Fashion)" value={sectorForm.name} onChange={(e) => setSectorForm({ ...sectorForm, name: e.target.value })} required style={{ flex: 1 }} />
              <button className="btn-secondary" type="submit" disabled={busy || !sectorForm.name.trim()}>Add Sector</button>
            </form>
          </div>
        </div>

        {/* Selected group detail — membership management */}
        <div className="card-surface">
          {!selectedGroup && <div style={{ color: '#5B6760', fontSize: 13.5 }}>Select a group to manage its members and routing.</div>}
          {selectedGroup && (
            <>
              <h3 style={{ marginBottom: 2 }}>{selectedGroup.name}</h3>
              <div style={{ fontSize: 12.5, color: '#5B6760', marginBottom: 4 }}>{selectedGroup.sector_name || 'No sector'} · created {timeAgo(selectedGroup.created_at)}</div>
              {selectedGroup.description && <div style={{ fontSize: 13, marginBottom: 12 }}>{selectedGroup.description}</div>}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Automatic Assignment</div>
                  <div style={{ fontSize: 12, color: '#5B6760' }}>Route new conversations to this group's agents automatically.</div>
                </div>
                <button className="btn-secondary" onClick={() => toggleAutoAssignment(selectedGroup)} disabled={busy} style={{ padding: '6px 14px', fontSize: 12.5 }}>
                  {selectedGroup.auto_assignment_enabled ? 'Turn Off' : 'Turn On'}
                </button>
              </div>

              <h4 style={{ marginBottom: 8, fontSize: 13.5 }}>Members ({members.length})</h4>
              {membersLoading && <div style={{ fontSize: 13, color: '#5B6760' }}>Loading…</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {!membersLoading && members.length === 0 && <div style={{ fontSize: 13, color: '#5B6760' }}>No agents in this group yet.</div>}
                {members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#F6FBF7' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{m.full_name}</div>
                      <div style={{ fontSize: 11.5, color: '#5B6760' }}>{m.title || (m.admin_role || 'agent').replace('_', ' ')} · {m.presence}</div>
                    </div>
                    <button className="btn-link" style={{ color: '#B42318' }} onClick={() => removeMember(m.id, m.full_name)}>Remove</button>
                  </div>
                ))}
              </div>

              <form onSubmit={addMember} style={{ display: 'flex', gap: 8 }}>
                <select value={addMemberAgentId} onChange={(e) => setAddMemberAgentId(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Add an agent…</option>
                  {agentsNotInGroup.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
                <button className="btn-secondary" type="submit" disabled={busy || !addMemberAgentId}>Add</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
