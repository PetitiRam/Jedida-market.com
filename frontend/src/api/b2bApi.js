import client from './client';

// ---- Manufacturer/Supplier catalog management (dashboard side) ----
export const getMyBusinessProfile = () => client.get('/b2b/business-profile');
export const updateMyBusinessProfile = (payload) => client.patch('/b2b/business-profile', payload);

export const getProductTiers = (productId) => client.get(`/b2b/products/${productId}/tiers`);
export const saveProductTiers = (productId, tiers) => client.put(`/b2b/products/${productId}/tiers`, { tiers });

export const getProductCertificates = (productId) => client.get(`/b2b/products/${productId}/certificates`);
export const addProductCertificate = (productId, payload) => client.post(`/b2b/products/${productId}/certificates`, payload);
export const deleteProductCertificate = (certificateId) => client.delete(`/b2b/certificates/${certificateId}`);

export const getBusinessAnalytics = () => client.get('/b2b/analytics');

// ---- Quote requests (buyer <-> manufacturer/supplier) ----
export const createQuoteRequest = (payload) => client.post('/b2b/quotes', payload);
export const myQuoteRequests = () => client.get('/b2b/quotes/mine');
export const incomingQuoteRequests = () => client.get('/b2b/quotes/incoming');
export const respondToQuote = (id, payload) => client.patch(`/b2b/quotes/${id}/respond`, payload);
export const declineQuote = (id) => client.patch(`/b2b/quotes/${id}/decline`);
export const acceptQuote = (id, payload) => client.post(`/b2b/quotes/${id}/accept`, payload);
