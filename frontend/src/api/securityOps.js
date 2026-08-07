import client from './client';

export const getSecurityOverview = () => client.get('/admin/security-ops/overview');
export const listSecurityEvents = (params) => client.get('/admin/security-ops/events', { params });
export const resolveSecurityEvent = (id) => client.patch(`/admin/security-ops/events/${id}/resolve`);
export const listBlockedIps = () => client.get('/admin/security-ops/blocked-ips');
export const blockIpAddress = (payload) => client.post('/admin/security-ops/blocked-ips', payload);
export const unblockIpAddress = (id) => client.delete(`/admin/security-ops/blocked-ips/${id}`);
export const searchAuditLog = (params) => client.get('/admin/security-ops/audit-log', { params });
export const getFaceVerificationSettings = () => client.get('/admin/security-ops/face-verification');
export const updateFaceVerificationSettings = (patch) => client.patch('/admin/security-ops/face-verification', patch);
