import { query, withTransaction } from '../config/db.js';

const ENTITY_TYPES = [
  'customer', 'business', 'order', 'wanted_request', 'dispute',
  'omnichannel_thread', 'inspection_request', 'factory_verification_request'
];

async function notify(userId, title, body, metadata = {}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata) VALUES ($1,'entity_assigned_to_you',$2,$3,$4)`,
    [userId, title, body, JSON.stringify(metadata)]
  );
}

// ------------------------------------------------------------
// CUSTOMER GROUPS
// ------------------------------------------------------------
export async function createCustomerGroup(req, res) {
  const { name, description, criteria, assignmentMode } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  if (assignmentMode && !['manual', 'round_robin', 'workload_balanced'].includes(assignmentMode)) {
    return res.status(400).json({ error: 'assignmentMode must be manual, round_robin, or workload_balanced.' });
  }
  try {
    const result = await query(
      `INSERT INTO customer_groups (name, description, criteria, assignment_mode, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, description || null, JSON.stringify(criteria || {}), assignmentMode || 'manual', req.user.id]
    );
    return res.status(201).json({ message: 'Group created.', group: result.rows[0] });
  } catch (err) {
    console.error('Create customer group error:', err);
    return res.status(500).json({ error: 'Could not create group.' });
  }
}

export async function listCustomerGroups(req, res) {
  try {
    const result = await query(
      `SELECT g.*,
              (SELECT COUNT(*) FROM customer_group_members m WHERE m.group_id = g.id) AS member_count,
              (SELECT COUNT(*) FROM customer_group_agents a WHERE a.group_id = g.id) AS agent_count
       FROM customer_groups g ORDER BY g.created_at DESC`
    );
    return res.json({ groups: result.rows });
  } catch (err) {
    console.error('List customer groups error:', err);
    return res.status(500).json({ error: 'Could not load groups.' });
  }
}

export async function updateCustomerGroup(req, res) {
  const { name, description, criteria, assignmentMode } = req.body;
  try {
    const result = await query(
      `UPDATE customer_groups SET
         name = COALESCE($2, name), description = COALESCE($3, description),
         criteria = COALESCE($4, criteria), assignment_mode = COALESCE($5, assignment_mode)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name || null, description || null, criteria ? JSON.stringify(criteria) : null, assignmentMode || null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Group not found.' });
    return res.json({ group: result.rows[0] });
  } catch (err) {
    console.error('Update customer group error:', err);
    return res.status(500).json({ error: 'Could not update group.' });
  }
}

export async function addAgentToGroup(req, res) {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required.' });
  try {
    const result = await query(
      `INSERT INTO customer_group_agents (group_id, agent_id) VALUES ($1,$2)
       ON CONFLICT (group_id, agent_id) DO NOTHING RETURNING *`,
      [req.params.id, agentId]
    );
    return res.status(201).json({ member: result.rows[0] || null });
  } catch (err) {
    console.error('Add agent to group error:', err);
    return res.status(500).json({ error: 'Could not add agent.' });
  }
}

export async function removeAgentFromGroup(req, res) {
  try {
    await query(`DELETE FROM customer_group_agents WHERE group_id = $1 AND agent_id = $2`, [req.params.id, req.params.agentId]);
    return res.json({ message: 'Removed.' });
  } catch (err) {
    console.error('Remove agent from group error:', err);
    return res.status(500).json({ error: 'Could not remove agent.' });
  }
}

export async function addCustomerToGroup(req, res) {
  const { customerId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId is required.' });
  try {
    const result = await query(
      `INSERT INTO customer_group_members (group_id, customer_id, added_by) VALUES ($1,$2,$3)
       ON CONFLICT (group_id, customer_id) DO NOTHING RETURNING *`,
      [req.params.id, customerId, req.user.id]
    );
    return res.status(201).json({ member: result.rows[0] || null });
  } catch (err) {
    console.error('Add customer to group error:', err);
    return res.status(500).json({ error: 'Could not add customer.' });
  }
}

export async function removeCustomerFromGroup(req, res) {
  try {
    await query(`DELETE FROM customer_group_members WHERE group_id = $1 AND customer_id = $2`, [req.params.id, req.params.customerId]);
    return res.json({ message: 'Removed.' });
  } catch (err) {
    console.error('Remove customer from group error:', err);
    return res.status(500).json({ error: 'Could not remove customer.' });
  }
}

export async function listGroupMembers(req, res) {
  try {
    const [agents, customers] = await Promise.all([
      query(`SELECT a.*, u.full_name, u.admin_role FROM customer_group_agents a JOIN users u ON u.id = a.agent_id WHERE a.group_id = $1`, [req.params.id]),
      query(`SELECT m.*, u.full_name, u.email FROM customer_group_members m JOIN users u ON u.id = m.customer_id WHERE m.group_id = $1`, [req.params.id])
    ]);
    return res.json({ agents: agents.rows, customers: customers.rows });
  } catch (err) {
    console.error('List group members error:', err);
    return res.status(500).json({ error: 'Could not load group members.' });
  }
}

// ------------------------------------------------------------
// ASSIGNMENT ENGINE
// ------------------------------------------------------------
async function pickAgentForGroup(client, group) {
  const agentsResult = await client.query(`SELECT agent_id FROM customer_group_agents WHERE group_id = $1`, [group.id]);
  const agentIds = agentsResult.rows.map((r) => r.agent_id);
  if (agentIds.length === 0) return null;

  if (group.assignment_mode === 'workload_balanced') {
    const loadResult = await client.query(
      `SELECT agent_id, COUNT(*) AS open_count FROM entity_assignments
       WHERE group_id = $1 AND unassigned_at IS NULL AND agent_id = ANY($2::uuid[])
       GROUP BY agent_id`,
      [group.id, agentIds]
    );
    const loadByAgent = new Map(agentIds.map((id) => [id, 0]));
    for (const row of loadResult.rows) loadByAgent.set(row.agent_id, Number(row.open_count));
    return [...loadByAgent.entries()].sort((a, b) => a[1] - b[1])[0][0];
  }

  // round_robin (default when a group has agents but no explicit mode
  // handling above): pick whoever received this group's assignment
  // least recently, cycling evenly through everyone.
  const lastAssignedResult = await client.query(
    `SELECT agent_id, MAX(assigned_at) AS last_assigned FROM entity_assignments
     WHERE group_id = $1 AND agent_id = ANY($2::uuid[]) GROUP BY agent_id`,
    [group.id, agentIds]
  );
  const lastByAgent = new Map(agentIds.map((id) => [id, null]));
  for (const row of lastAssignedResult.rows) lastByAgent.set(row.agent_id, row.last_assigned);
  // Agents never assigned (null) go first, then oldest last_assigned.
  return [...lastByAgent.entries()].sort((a, b) => {
    if (a[1] === null && b[1] === null) return 0;
    if (a[1] === null) return -1;
    if (b[1] === null) return 1;
    return new Date(a[1]) - new Date(b[1]);
  })[0][0];
}

export async function assignEntity(req, res) {
  const { entityType, entityId, agentId, groupId } = req.body;
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required.' });
  if (!ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: `entityType must be one of: ${ENTITY_TYPES.join(', ')}` });
  if (!agentId && !groupId) return res.status(400).json({ error: 'Provide either agentId (manual) or groupId (automated).' });

  try {
    const assignment = await withTransaction(async (client) => {
      // Close any currently-open assignment for this entity first — the
      // partial unique index requires it, and this is exactly the
      // "reassignment creates a new audit row" behavior we want.
      await client.query(
        `UPDATE entity_assignments SET unassigned_at = now() WHERE entity_type = $1 AND entity_id = $2 AND unassigned_at IS NULL`,
        [entityType, entityId]
      );

      let finalAgentId = agentId;
      let mode = 'manual';
      let resolvedGroupId = null;

      if (!finalAgentId && groupId) {
        const groupResult = await client.query(`SELECT * FROM customer_groups WHERE id = $1`, [groupId]);
        const group = groupResult.rows[0];
        if (!group) throw Object.assign(new Error('Group not found.'), { status: 404 });
        const picked = await pickAgentForGroup(client, group);
        if (!picked) throw Object.assign(new Error('This group has no agents to assign to.'), { status: 400 });
        finalAgentId = picked;
        mode = group.assignment_mode === 'manual' ? 'round_robin' : group.assignment_mode;
        resolvedGroupId = group.id;
      }

      const inserted = await client.query(
        `INSERT INTO entity_assignments (entity_type, entity_id, agent_id, group_id, assignment_mode, assigned_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [entityType, entityId, finalAgentId, resolvedGroupId, mode, req.user.id]
      );
      return inserted.rows[0];
    });

    await notify(assignment.agent_id, 'New assignment', `You were assigned a ${entityType.replace('_', ' ')}.`, { entityType, entityId, assignmentId: assignment.id });

    return res.status(201).json({ message: 'Assigned.', assignment });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Assign entity error:', err);
    return res.status(500).json({ error: 'Could not create this assignment.' });
  }
}

export async function unassignEntity(req, res) {
  const { entityType, entityId } = req.body;
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required.' });
  try {
    const result = await query(
      `UPDATE entity_assignments SET unassigned_at = now()
       WHERE entity_type = $1 AND entity_id = $2 AND unassigned_at IS NULL RETURNING *`,
      [entityType, entityId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No open assignment found for this entity.' });
    return res.json({ message: 'Unassigned.', assignment: result.rows[0] });
  } catch (err) {
    console.error('Unassign entity error:', err);
    return res.status(500).json({ error: 'Could not unassign this entity.' });
  }
}

export async function getEntityAssignmentHistory(req, res) {
  const { entityType, entityId } = req.query;
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId query params are required.' });
  try {
    const result = await query(
      `SELECT ea.*, u.full_name AS agent_name FROM entity_assignments ea
       JOIN users u ON u.id = ea.agent_id
       WHERE ea.entity_type = $1 AND ea.entity_id = $2 ORDER BY ea.assigned_at DESC`,
      [entityType, entityId]
    );
    return res.json({ history: result.rows });
  } catch (err) {
    console.error('Get entity assignment history error:', err);
    return res.status(500).json({ error: 'Could not load assignment history.' });
  }
}

export async function myOpenAssignments(req, res) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  try {
    const result = await query(
      `SELECT * FROM entity_assignments WHERE agent_id = $1 AND unassigned_at IS NULL ORDER BY assigned_at DESC`,
      [req.user.id]
    );
    return res.json({ assignments: result.rows });
  } catch (err) {
    console.error('My open assignments error:', err);
    return res.status(500).json({ error: 'Could not load your assignments.' });
  }
}

export { ENTITY_TYPES };
