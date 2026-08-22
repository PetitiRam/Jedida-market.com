import client from './client';

// ---- Customer groups ----
export const createCustomerGroup = (payload) => client.post('/assignment-engine/groups', payload);
export const listCustomerGroups = () => client.get('/assignment-engine/groups');
export const updateCustomerGroup = (id, payload) => client.patch(`/assignment-engine/groups/${id}`, payload);
export const listGroupMembers = (id) => client.get(`/assignment-engine/groups/${id}/members`);
export const addAgentToGroup = (id, agentId) => client.post(`/assignment-engine/groups/${id}/agents`, { agentId });
export const removeAgentFromGroup = (id, agentId) => client.delete(`/assignment-engine/groups/${id}/agents/${agentId}`);
export const addCustomerToGroup = (id, customerId) => client.post(`/assignment-engine/groups/${id}/customers`, { customerId });
export const removeCustomerFromGroup = (id, customerId) => client.delete(`/assignment-engine/groups/${id}/customers/${customerId}`);

// ---- Assignment engine ----
export const assignEntity = (payload) => client.post('/assignment-engine/assign', payload);
export const unassignEntity = (payload) => client.post('/assignment-engine/unassign', payload);
export const getEntityAssignmentHistory = (entityType, entityId) =>
  client.get('/assignment-engine/history', { params: { entityType, entityId } });
export const myOpenAssignments = () => client.get('/assignment-engine/mine');
