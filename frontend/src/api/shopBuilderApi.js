import client from './client';

export const getBuilderState = () => client.get('/shop-builder/me');
export const updateTheme = (payload) => client.patch('/shop-builder/me/theme', payload);

export const addBlock = (blockType, config = {}) => client.post('/shop-builder/me/blocks', { blockType, config });
export const updateBlock = (id, payload) => client.patch(`/shop-builder/me/blocks/${id}`, payload);
export const deleteBlock = (id) => client.delete(`/shop-builder/me/blocks/${id}`);
export const duplicateBlock = (id) => client.post(`/shop-builder/me/blocks/${id}/duplicate`);
export const reorderBlocks = (orderedBlockIds) => client.patch('/shop-builder/me/blocks/reorder', { orderedBlockIds });

export const previewBlocks = () => client.get('/shop-builder/me/preview');
export const publishBlocks = () => client.post('/shop-builder/me/publish');

export const aiDesignStore = (payload) => client.post('/shop-builder/me/ai-design', payload);
export const reportShopContent = (payload) => client.post('/shop-builder/report', payload);

export const trackShopEvent = (payload) => client.post('/shop-builder/track', payload).catch(() => {});
export const getShopAnalytics = (days) => client.get('/shop-builder/me/analytics', { params: { days } });
export const getBusinessInsights = (days) => client.get('/shop-builder/me/business-insights', { params: { days } });

// Admin
export const listThemeAvailability = () => client.get('/admin/shop-builder/themes');
export const updateThemeAvailability = (theme, isEnabled) => client.patch(`/admin/shop-builder/themes/${theme}`, { isEnabled });
export const listShopContentReports = (status) => client.get('/admin/shop-builder/reports', { params: { status } });
export const reviewShopContentReport = (id, status, notes) => client.patch(`/admin/shop-builder/reports/${id}`, { status, notes });
