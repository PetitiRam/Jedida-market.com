import client from './client';

// ---- Collections ----
export const listMyCollections = () => client.get('/enterprise/collections/mine');
export const listShopCollections = (shopId) => client.get(`/enterprise/shops/${shopId}/collections`);
export const createCollection = (payload) => client.post('/enterprise/collections', payload);
export const updateCollection = (id, payload) => client.patch(`/enterprise/collections/${id}`, payload);
export const deleteCollection = (id) => client.delete(`/enterprise/collections/${id}`);
export const setCollectionProducts = (id, productIds) => client.put(`/enterprise/collections/${id}/products`, { productIds });

// ---- Shop reviews ----
export const listShopReviews = (shopId) => client.get(`/enterprise/shops/${shopId}/reviews`);
export const createShopReview = (shopId, payload) => client.post(`/enterprise/shops/${shopId}/reviews`, payload);
