import { useEffect, useState } from 'react';
import * as engineApi from '../../api/assignmentEngineApi';

const MODE_LABELS = { manual: 'Manual only', round_robin: 'Round robin', workload_balanced: 'Workload balanced' };
const ENTITY_TYPES = ['customer', 'business', 'order', 'wanted_request', 'dispute', 'omnichannel_thread', 'inspection_request', 'factory_verification_request'];

function CreateGroupForm({ onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assignmentMode, setAssignmentMode] = useState('manual');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await engineApi.createCustomerGroup({ name: name.trim(), description: description || undefined, assignmentMode });
      setName(''); setDescription('');
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div className="field-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
        <label>Group name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Uganda B2B" />
      </div>
      <div className="field-group" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
        <label>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field-group" style={{ marginBottom: 0 }}>
        <label>Assignment mode</label>
        <select value={assignmentMode} onChange={(e) => setAssignmentMode(e.target.value)}>
          <option value="manual">Manual only</option>
          <option value="round_robin">Round robin</option>
          <option value="workload_balanced">Workload balanced</option>
        </select>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
    </form>
  );
}

function GroupCard({ group, onChanged }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState(null);
  const [agentId, setAgentId] = useState('');
  const [customerId, setCustomerId] = useState('');

  const loadMembers = async () => {
    const { data } = await engineApi.listGroupMembers(group.id);
    setMembers(data);
  };
  useEffect(() => { if (open) loadMembers(); }, [open]);

  const addAgent = async (e) => {
    e.preventDefault();
    if (!agentId.trim()) return;
    await engineApi.addAgentToGroup(group.id, agentId.trim());
    setAgentId('');
    loadMembers(); onChanged();
  };
  const addCustomer = async (e) => {
    e.preventDefault();
    if (!customerId.trim()) return;
    await engineApi.addCustomerToGroup(group.id, customerId.trim());
    setCustomerId('');
    loadMembers(); onChanged();
  };

  return (
    <div className="card-surface" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div>
          <strong>{group.name}</strong>
          <div className="product-card-meta">{group.description}</div>
        </div>
        <span className="product-card-badge">{MODE_LABELS[group.assignment_mode]} · {group.agent_count} agent(s) · {group.member_count} customer(s)</span>
      </div>

      {open && members && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <strong style={{ fontSize: '0.85rem' }}>Agents</strong>
          <ul style={{ fontSize: '0.85rem', paddingLeft: 18 }}>
            {members.agents.map((a) => (
              <li key={a.id}>{a.full_name} ({a.admin_role})
                <button className="btn-link" style={{ marginLeft: 8 }} onClick={() => engineApi.removeAgentFromGroup(group.id, a.agent_id).then(loadMembers)}>Remove</button>
              </li>
            ))}
          </ul>
          <form onSubmit={addAgent} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Agent user ID" style={{ flex: 1 }} />
            <button className="btn-link">Add agent</button>
          </form>

          <strong style={{ fontSize: '0.85rem' }}>Customers</strong>
          <ul style={{ fontSize: '0.85rem', paddingLeft: 18 }}>
            {members.customers.map((c) => (
              <li key={c.id}>{c.full_name} ({c.email})
                <button className="btn-link" style={{ marginLeft: 8 }} onClick={() => engineApi.removeCustomerFromGroup(group.id, c.customer_id).then(loadMembers)}>Remove</button>
              </li>
            ))}
          </ul>
          <form onSubmit={addCustomer} style={{ display: 'flex', gap: 8 }}>
            <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Customer user ID" style={{ flex: 1 }} />
            <button className="btn-link">Add customer</button>
          </form>
        </div>
      )}
    </div>
  );
}

function AssignEntityForm({ groups }) {
  const [entityType, setEntityType] = useState(ENTITY_TYPES[0]);
  const [entityId, setEntityId] = useState('');
  const [mode, setMode] = useState('agent'); // 'agent' | 'group'
  const [agentId, setAgentId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!entityId.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { data } = await engineApi.assignEntity({
        entityType, entityId: entityId.trim(),
        agentId: mode === 'agent' ? agentId.trim() : undefined,
        groupId: mode === 'group' ? groupId : undefined
      });
      setResult(data.assignment);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not assign.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-surface">
      <h3 style={{ marginTop: 0 }}>Assign an item</h3>
      {error && <div className="alert alert-error">{error}</div>}
      {result && <div className="alert">Assigned to agent {result.agent_id} via {result.assignment_mode}.</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="field-group" style={{ flex: 1, minWidth: 160 }}>
          <label>Entity type</label>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 200 }}>
          <label>Entity ID</label>
          <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="UUID" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, margin: '8px 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="radio" checked={mode === 'agent'} onChange={() => setMode('agent')} /> Assign to a specific agent
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="radio" checked={mode === 'group'} onChange={() => setMode('group')} /> Assign via a group (auto)
        </label>
      </div>

      {mode === 'agent'
        ? <div className="field-group"><label>Agent user ID</label><input value={agentId} onChange={(e) => setAgentId(e.target.value)} /></div>
        : (
          <div className="field-group">
            <label>Group</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Select a group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({MODE_LABELS[g.assignment_mode]})</option>)}
            </select>
          </div>
        )}

      <button className="btn-primary" disabled={busy}>{busy ? 'Assigning…' : 'Assign'}</button>
    </form>
  );
}

export default function AssignmentEnginePanel() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await engineApi.listCustomerGroups();
      setGroups(data.groups || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <CreateGroupForm onCreated={load} />
      <h3>Customer Groups</h3>
      {loading && <div className="empty-state">Loading…</div>}
      {!loading && groups.length === 0 && <div className="empty-state">No groups yet.</div>}
      {groups.map((g) => <GroupCard key={g.id} group={g} onChanged={load} />)}

      <div style={{ marginTop: 20 }}>
        <AssignEntityForm groups={groups} />
      </div>
    </div>
  );
}
