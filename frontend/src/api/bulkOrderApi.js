import client from './client';

// ---- RFQ negotiation ----
export const listQuoteMessages = (quoteId) => client.get(`/bulk/quotes/${quoteId}/messages`);
export const sendQuoteMessage = (quoteId, payload) => client.post(`/bulk/quotes/${quoteId}/messages`, payload);

// ---- Purchase agreements ----
export const createPurchaseAgreement = (payload) => client.post('/bulk/agreements', payload);
export const myPurchaseAgreements = () => client.get('/bulk/agreements');
export const getPurchaseAgreement = (id) => client.get(`/bulk/agreements/${id}`);
export const respondPurchaseAgreement = (id, action) => client.patch(`/bulk/agreements/${id}`, { action });
export const checkoutPurchaseAgreement = (id, payload) => client.post(`/bulk/agreements/${id}/checkout`, payload);

// ---- Bulk invoices ----
export const myInvoices = () => client.get('/bulk/invoices');
export const getInvoice = (id) => client.get(`/bulk/invoices/${id}`);
export const issueInvoiceForOrder = (orderId) => client.post(`/bulk/orders/${orderId}/invoice`);
