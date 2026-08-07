// Same backend endpoints partner-portal/SecurityPanel.jsx already uses
// (they're plain requireAuth routes on /api/auth, not partner-specific),
// just wired through the regular `client` so any signed-in user — buyer,
// seller, etc. — can reach them from their own account settings.
import client from './client';

export const changePassword = (currentPassword, newPassword) =>
  client.post('/auth/change-password', { currentPassword, newPassword });

export const setupTwoFactor = () => client.post('/auth/2fa/setup');
export const verifyTwoFactor = (code) => client.post('/auth/2fa/verify', { code });
export const disableTwoFactor = (currentPassword) => client.post('/auth/2fa/disable', { currentPassword });

export const listSessions = () => client.get('/auth/sessions');
export const revokeSession = (id) => client.delete(`/auth/sessions/${id}`);
export const logoutAllSessions = () => client.post('/auth/logout-all');

export const getLoginHistory = () => client.get('/auth/login-history');
