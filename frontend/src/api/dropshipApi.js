import client from './client';

// ---- Businesses / partnerships ----
export const listDropshipBusinesses = (search) => client.get('/dropship/businesses', { params: { search } });
export const requestPartnership = (businessId, message, agreementAccepted) =>
  client.post('/dropship/partnerships', { businessId, message, agreementAccepted });
export const myPartnerships = () => client.get('/dropship/partnerships');
export const respondPartnership = (id, payload) => client.patch(`/dropship/partnerships/${id}`, payload);

// ---- Catalog / product access ----
export const browseDropshipCatalog = (params) => client.get('/dropship/catalog', { params });
export const requestProductAccess = (productId, note) => client.post('/dropship/product-access', { productId, note });
export const myProductAccess = () => client.get('/dropship/product-access/mine');
export const incomingProductAccess = () => client.get('/dropship/product-access/incoming');
export const respondProductAccess = (id, payload) => client.patch(`/dropship/product-access/${id}`, payload);
export const toggleDropshippable = (productId, isDropshippable) =>
  client.patch(`/dropship/products/${productId}/dropshippable`, { isDropshippable });

// ---- Marketing materials ----
export const listMarketingAssets = (productId) => client.get(`/dropship/products/${productId}/marketing-assets`);
export const addMarketingAsset = (productId, payload) => client.post(`/dropship/products/${productId}/marketing-assets`, payload);
export const deleteMarketingAsset = (assetId) => client.delete(`/dropship/marketing-assets/${assetId}`);

// ---- Orders / commission ----
export const getAccessForCheckout = (accessId) => client.get(`/dropship/access/${accessId}`);
export const createDropshipOrder = (payload) => client.post('/dropship/orders', payload);
export const releaseDropshipCommission = (orderId) => client.post(`/dropship/orders/${orderId}/release-commission`);
export const reverseDropshipCommission = (orderId, reason) => client.post(`/dropship/orders/${orderId}/reverse-commission`, { reason });

// ---- Dashboards ----
export const salesDashboard = () => client.get('/dropship/dashboard');
export const dropshipperPerformance = (dropshipperId) => client.get(`/dropship/dropshippers/${dropshipperId}/performance`);

// ---- Audit log ----
export const myAuditLog = (params) => client.get('/dropship/audit-log', { params });
