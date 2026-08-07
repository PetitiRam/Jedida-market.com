import client from './client';

export const listPartnerApps = (params) => client.get('/partner-apps', { params });
export const getPartnerApp = (id) => client.get(`/partner-apps/${id}`);
export const submitPartnerAppInterest = (id, payload) => client.post(`/partner-apps/${id}/interest`, payload);

// Dropshipping — requires the user to be signed in.
export const getDropshipStatus = (id) => client.get(`/partner-apps/${id}/dropship/status`);
export const enrollDropshipping = (id, acknowledged) => client.post(`/partner-apps/${id}/dropship/enroll`, { acknowledged });
export const cancelDropshipEnrollment = (id) => client.delete(`/partner-apps/${id}/dropship/enroll`);
