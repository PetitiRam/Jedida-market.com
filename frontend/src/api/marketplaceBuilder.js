import client from './client';

// Public — resolved, ordered, currently-live homepage section layout.
export const getMarketplaceLayout = () => client.get('/marketplace-layout');
export const getPublicSection = (key, params) => client.get(`/marketplace-layout/section/${key}`, { params });

// Admin — Marketplace Builder CMS
export const listSections = () => client.get('/admin/marketplace/sections');
export const getSection = (id) => client.get(`/admin/marketplace/sections/${id}`);
export const createSection = (payload) => client.post('/admin/marketplace/sections', payload);
export const updateSection = (id, payload) => client.patch(`/admin/marketplace/sections/${id}`, payload);
export const toggleSectionEnabled = (id, isEnabled) => client.patch(`/admin/marketplace/sections/${id}/enabled`, { isEnabled });
export const deleteSection = (id) => client.delete(`/admin/marketplace/sections/${id}`);
export const reorderSections = (order) => client.post('/admin/marketplace/sections/reorder', { order });

export const attachProducts = (id, productIds) => client.post(`/admin/marketplace/sections/${id}/products`, { productIds });
export const reorderSectionProducts = (id, productIds) => client.post(`/admin/marketplace/sections/${id}/products/reorder`, { productIds });
export const detachProduct = (id, productId) => client.delete(`/admin/marketplace/sections/${id}/products/${productId}`);

export const attachShops = (id, shopIds) => client.post(`/admin/marketplace/sections/${id}/shops`, { shopIds });
export const detachShop = (id, shopId) => client.delete(`/admin/marketplace/sections/${id}/shops/${shopId}`);

export const attachCategories = (id, categories) => client.post(`/admin/marketplace/sections/${id}/categories`, { categories });

export const searchProducts = (search) => client.get('/admin/marketplace/product-search', { params: { search } });
export const searchShops = (search) => client.get('/admin/marketplace/shop-search', { params: { search } });

// Tausi AI marketplace automation
export const getTausiSettings = () => client.get('/ai/tausi/marketplace/settings');
export const setTausiBehaviorEnabled = (behavior, isEnabled) => client.patch(`/ai/tausi/marketplace/settings/${behavior}`, { isEnabled });
export const getTausiActions = (status) => client.get('/ai/tausi/marketplace/actions', { params: status ? { status } : {} });
export const runTausiBehavior = (behavior) => client.post(`/ai/tausi/marketplace/run/${behavior}`);
export const decideTausiAction = (id, status) => client.patch(`/ai/tausi/marketplace/actions/${id}`, { status });
