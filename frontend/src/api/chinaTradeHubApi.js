import client from './client';

// ---- Supplier/manufacturer self-service ----
export const saveTradeCapabilities = (payload) => client.put('/china-trade-hub/capabilities', payload);
export const getMyTradeCapabilities = () => client.get('/china-trade-hub/capabilities/mine');
export const requestFactoryVerification = (notes) => client.post('/china-trade-hub/factory-verification/request', { notes });
export const myFactoryVerifications = () => client.get('/china-trade-hub/factory-verification/mine');

// ---- Buyer-facing ----
export const getSupplierTradeProfile = (businessProfileId) => client.get(`/china-trade-hub/suppliers/${businessProfileId}`);
export const requestInspection = (payload) => client.post('/china-trade-hub/inspections', payload);
export const myInspectionRequests = () => client.get('/china-trade-hub/inspections/mine');

// ---- Admin ----
export const adminListFactoryVerifications = (status) => client.get('/china-trade-hub/admin/factory-verification', { params: { status } });
export const adminScheduleFactoryVerification = (id, payload) => client.patch(`/china-trade-hub/admin/factory-verification/${id}/schedule`, payload);
export const adminSubmitFactoryVerificationReport = (id, payload) => client.post(`/china-trade-hub/admin/factory-verification/${id}/report`, payload);
export const adminAwardAfricaReadyBadge = (payload) => client.post('/china-trade-hub/admin/africa-ready/award', payload);
export const adminRevokeAfricaReadyBadge = (businessProfileId, reason) => client.post(`/china-trade-hub/admin/africa-ready/${businessProfileId}/revoke`, { reason });

export const adminListInspections = (status) => client.get('/china-trade-hub/admin/inspections', { params: { status } });
export const adminScheduleInspection = (id, payload) => client.patch(`/china-trade-hub/admin/inspections/${id}/schedule`, payload);
export const adminSubmitInspectionReport = (id, payload) => client.post(`/china-trade-hub/admin/inspections/${id}/report`, payload);
