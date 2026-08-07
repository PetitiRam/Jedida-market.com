import client from './client';

export const getMyDeveloperProfile = () => client.get('/dev/me');
export const registerDeveloper = (payload) => client.post('/dev/register', payload);
export const getApiCatalog = () => client.get('/dev/catalog');

export const createOrganization = (payload) => client.post('/dev/organizations', payload);
export const listMyOrganizations = () => client.get('/dev/organizations');
export const inviteOrgMember = (orgId, payload) => client.post(`/dev/organizations/${orgId}/members`, payload);
export const listOrgMembers = (orgId) => client.get(`/dev/organizations/${orgId}/members`);

// Phase 51 — API Keys, OAuth Applications, Sandbox
export const listApiKeys = () => client.get('/dev/api-keys');
export const createApiKey = (payload) => client.post('/dev/api-keys', payload);
export const revokeApiKey = (id, reason) => client.post(`/dev/api-keys/${id}/revoke`, { reason });

export const listOAuthApps = () => client.get('/dev/oauth-apps');
export const createOAuthApp = (payload) => client.post('/dev/oauth-apps', payload);
export const suspendOAuthApp = (id) => client.post(`/dev/oauth-apps/${id}/suspend`);

export const listSandboxResourceTypes = () => client.get('/dev/sandbox/resource-types');
export const listSandboxResources = (type) => client.get('/dev/sandbox', { params: type ? { type } : {} });
export const createSandboxResource = (payload) => client.post('/dev/sandbox', payload);
export const resetSandbox = (orgId) => client.post('/dev/sandbox/reset', { orgId });

// Admin review queue
export const adminListDevelopers = (status) => client.get('/admin/dev/developers', { params: status ? { status } : {} });
export const adminReviewDeveloper = (id, payload) => client.post(`/admin/dev/developers/${id}/review`, payload);
export const adminListOrganizations = (status) => client.get('/admin/dev/organizations', { params: status ? { status } : {} });
export const adminReviewOrganization = (id, payload) => client.post(`/admin/dev/organizations/${id}/review`, payload);
