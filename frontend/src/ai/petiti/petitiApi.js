import client from '../../api/client';

const base = '/ai/petiti';

export const getDashboard = () => client.get(`${base}/dashboard`);
export const getLogs = (params) => client.get(`${base}/logs`, { params });
export const getAlerts = (params) => client.get(`${base}/alerts`, { params });
export const resolveAlert = (id) => client.post(`${base}/alerts/${id}/resolve`);
export const dismissAlert = (id) => client.post(`${base}/alerts/${id}/dismiss`);
export const getActions = (params) => client.get(`${base}/actions`, { params });
export const approveAction = (id) => client.post(`${base}/actions/${id}/approve`);
export const getSecurity = () => client.get(`${base}/security`);
export const runSecurityScan = () => client.post(`${base}/security/scan`);
export const getMarketplaceIntel = () => client.get(`${base}/marketplace`);
export const getRecommendations = () => client.get(`${base}/recommendations`);
export const getHealthHistory = () => client.get(`${base}/health`);

export const updateLogo = (logoUrl) => client.put(`${base}/site/logo`, { logoUrl });
export const updateTheme = (payload) => client.put(`${base}/site/theme`, payload);
export const updateCustomCss = (css) => client.put(`${base}/site/css`, { css });
export const getPages = () => client.get(`${base}/site/pages`);
export const savePage = (payload) => client.post(`${base}/site/pages`, payload);
export const deletePage = (id) => client.delete(`${base}/site/pages/${id}`);
export const proposeCodeChange = (payload) => client.post(`${base}/site/propose-code-change`, payload);

export const getAuthPolicy = () => client.get(`${base}/security/auth-policy`);
export const upgradeAuthPolicy = (patch, reasoning) => client.post(`${base}/security/auth-policy/upgrade`, { patch, reasoning });

// ===== Threat Response Engine / Security Command Centre =====
export const getCommandCenter = () => client.get(`${base}/security/command-center`);
export const getSecurityHolds = (params) => client.get(`${base}/security/holds`, { params });
export const liftSecurityState = (userId) => client.post(`${base}/security/state/${userId}/lift`);
export const requirePasswordReset = (userId, reason) => client.post(`${base}/security/state/${userId}/require-password-reset`, { reason });

export const getBlockedIps = () => client.get(`${base}/security/ip`);
export const getFailedLogins = (limit) => client.get(`${base}/security/failed-logins`, { params: { limit } });
export const getActiveSessions = (limit) => client.get(`${base}/security/active-sessions`, { params: { limit } });
export const blockIp = (ip, reason) => client.post(`${base}/security/ip/block`, { ip, reason });
export const unblockIp = (ip) => client.post(`${base}/security/ip/${ip}/unblock`);

export const getEmergencyMode = () => client.get(`${base}/security/emergency-mode`);
export const enterEmergencyMode = (reason) => client.post(`${base}/security/emergency-mode/enter`, { reason });
export const exitEmergencyMode = () => client.post(`${base}/security/emergency-mode/exit`);

// ===== Self-learning =====
export const reviewFraudReport = (id, outcome) => client.post(`${base}/security/reports/${id}/review`, { outcome });
export const getLearningStats = () => client.get(`${base}/security/learning`);
