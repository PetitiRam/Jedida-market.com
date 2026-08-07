import client from './client';

export const getPublicShopV2 = (slug, params) => client.get(`/shops/public-v2/${slug}`, { params });
export const updateShopSettings = (payload) => client.patch('/shops/me/settings', payload);
export const setFeaturedProducts = (productIds) => client.patch('/shops/me/featured', { productIds });
