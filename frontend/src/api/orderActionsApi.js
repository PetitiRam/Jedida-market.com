import client from './client';

export const cancelOrder = (orderId, reason) => client.post(`/orders/${orderId}/cancel`, { reason });
export const reorder = (orderId) => client.post(`/orders/${orderId}/reorder`);
export const getReceipt = (orderId) => client.get(`/orders/${orderId}/receipt`);
export const contactSellerAboutOrder = (orderId, message) => client.post(`/orders/${orderId}/contact-seller`, { message });
