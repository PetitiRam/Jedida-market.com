import client from './client';

export const getPublicShopV2 = (slug, params) => client.get(`/shops/public-v2/${slug}`, { params });
// Real, admin-configured payment methods (settingsCenter "payment" section) —
// used to render "Secure Payments with Jedida" from actual enabled providers
// instead of a hardcoded icon row.
export const getPublicPaymentMethods = () => client.get('/admin/settings-center/public/payment-methods');
export const getSellerPaymentsOverview = () => client.get('/shops/me/payments-overview');
export const listMyProviderConnections = () => client.get('/provider-registry/mine');
export const connectProvider = (providerId, destination) => client.post(`/provider-registry/mine/${providerId}/connect`, { destination });
export const disconnectProvider = (providerId) => client.post(`/provider-registry/mine/${providerId}/disconnect`);
export const updateShopSettings = (payload) => client.patch('/shops/me/settings', payload);
export const setFeaturedProducts = (productIds) => client.patch('/shops/me/featured', { productIds });
