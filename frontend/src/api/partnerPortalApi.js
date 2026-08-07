import client from './client';

// ---- Dashboard ----
export const getPartnerDashboard = () => client.get('/partner-portal/dashboard');

// ---- Company profile ----
export const getCompanyProfile = () => client.get('/partner-portal/company-profile');
export const updateCompanyProfile = (payload) => client.patch('/partner-portal/company-profile', payload);
export const uploadCompanyLogo = (file, onUploadProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post('/partner-portal/company-profile/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  });
};
export const requestProfileChange = (changes) => client.post('/partner-portal/company-profile/change-requests', changes);

export const addPartnerContact = (contact) => client.post('/partner-portal/company-profile/contacts', contact);
export const updatePartnerContact = (contactId, contact) => client.patch(`/partner-portal/company-profile/contacts/${contactId}`, contact);
export const deletePartnerContact = (contactId) => client.delete(`/partner-portal/company-profile/contacts/${contactId}`);

// ---- Integration Center: API keys ----
export const listApiKeys = () => client.get('/partner-portal/api-keys');
// payload: { label?, environment: 'sandbox' | 'live', currentPassword? }
// currentPassword is required by the backend when environment === 'live'
// (2FA must also already be enabled on the account).
export const generateApiKey = (payload) => client.post('/partner-portal/api-keys', payload);
export const regenerateApiKey = (id, currentPassword) => client.post(`/partner-portal/api-keys/${id}/regenerate`, { currentPassword });
export const revokeApiKey = (id) => client.delete(`/partner-portal/api-keys/${id}`);

// ---- Integration Center: Webhooks ----
export const listWebhooks = () => client.get('/partner-portal/webhooks');
export const createWebhook = (payload) => client.post('/partner-portal/webhooks', payload);
export const updateWebhook = (id, payload) => client.patch(`/partner-portal/webhooks/${id}`, payload);
export const deleteWebhook = (id) => client.delete(`/partner-portal/webhooks/${id}`);

// ---- Sandbox ----
export const getSandboxSample = () => client.get('/partner-portal/sandbox/sample');
export const listSandboxLogs = () => client.get('/partner-portal/sandbox/logs');
export const testApiConnection = (payload) => client.post('/partner-portal/sandbox/test-api', payload);
export const testWebhook = (webhookId) => client.post(`/partner-portal/sandbox/webhooks/${webhookId}/test`);

// ---- Support ----
export const listTickets = () => client.get('/partner-portal/support/tickets');
export const createTicket = (payload) => client.post('/partner-portal/support/tickets', payload);
export const getTicket = (id) => client.get(`/partner-portal/support/tickets/${id}`);
export const replyToTicket = (id, body, file, onUploadProgress) => {
  const formData = new FormData();
  formData.append('body', body);
  if (file) formData.append('file', file);
  return client.post(`/partner-portal/support/tickets/${id}/messages`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  });
};
export const closeTicket = (id) => client.patch(`/partner-portal/support/tickets/${id}`, { status: 'closed' });

// ---- Audit log ----
export const getAuditLog = (params) => client.get('/partner-portal/audit-log', { params });

// ---- Security (generic /auth endpoints, reused by the portal) ----
export const changePassword = (currentPassword, newPassword) => client.post('/auth/change-password', { currentPassword, newPassword });
export const getLoginHistory = () => client.get('/auth/login-history');
export const listSessions = () => client.get('/auth/sessions');
export const revokeSession = (id) => client.delete(`/auth/sessions/${id}`);
export const logoutAllSessions = () => client.post('/auth/logout-all');
export const setupTwoFactor = () => client.post('/auth/2fa/setup');
export const verifyTwoFactor = (code) => client.post('/auth/2fa/verify', { code });
export const disableTwoFactor = (currentPassword) => client.post('/auth/2fa/disable', { currentPassword });

// ---- Notifications (generic, reused by the portal) ----
export const getMyNotifications = () => client.get('/notifications/mine');
export const markNotificationRead = (id) => client.post(`/notifications/${id}/read`);

// ---- Partner Apps directory (partner-side settings) ----
export const getDirectoryListing = () => client.get('/partner-portal/directory-listing');
export const updateDirectoryListing = (payload) => client.patch('/partner-portal/directory-listing', payload);
export const getDropshippingProgram = () => client.get('/partner-portal/dropshipping');
export const updateDropshippingProgram = (payload) => client.patch('/partner-portal/dropshipping', payload);
