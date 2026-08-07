import client from './client';

// ---- Disputes (buyer/seller) ----
export const openDispute = (payload) => client.post('/trust/disputes', payload);
export const myDisputes = () => client.get('/trust/disputes/mine');
export const getDispute = (id) => client.get(`/trust/disputes/${id}`);
export const addDisputeMessage = (id, message) => client.post(`/trust/disputes/${id}/messages`, { message });
export const addDisputeEvidence = (id, fileUrl, caption) => client.post(`/trust/disputes/${id}/evidence`, { fileUrl, caption });

// ---- Disputes (admin) ----
export const adminListDisputes = (status) => client.get('/trust/admin/disputes', { params: { status } });
export const resolveDispute = (id, payload) => client.patch(`/trust/admin/disputes/${id}/resolve`, payload);
export const addAdminDisputeNote = (id, message) => client.post(`/trust/disputes/${id}/messages`, { message, isAdminNote: true });

// ---- Fraud flags (admin) ----
export const listFraudFlags = (status) => client.get('/trust/admin/fraud-flags', { params: { status } });
export const reviewFraudFlag = (id, payload) => client.patch(`/trust/admin/fraud-flags/${id}`, payload);
export const runFraudScan = () => client.post('/trust/admin/fraud-flags/scan');

// ---- Unified security timeline (admin) ----
export const userSecurityTimeline = (userId) => client.get(`/trust/admin/users/${userId}/timeline`);
