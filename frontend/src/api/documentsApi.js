import client from './client';

// Buyer Document Center
export const buyerDocumentHistory = () => client.get('/documents/buyer/history');
export const buyerReceipts = () => client.get('/documents/buyer/receipts');
export const buyerInvoices = () => client.get('/documents/buyer/invoices');
export const buyerRefunds = () => client.get('/documents/buyer/refunds');
export const buyerDeliveries = () => client.get('/documents/buyer/deliveries');

// Seller / Business Center
export const sellerInvoices = (params) => client.get('/documents/seller/invoices', { params });
export const sellerSales = () => client.get('/documents/seller/sales');
export const sellerPendingPayments = () => client.get('/documents/seller/pending-payments');
export const sellerRevenueReport = () => client.get('/documents/seller/revenue-report');
export const sellerCustomerHistory = (customerId) => client.get(`/documents/seller/customers/${customerId}/history`);

// Invoice CRUD
export const createInvoice = (payload) => client.post('/documents/invoices', payload);
export const updateInvoice = (id, payload) => client.patch(`/documents/invoices/${id}`, payload);
export const updateInvoiceStatus = (id, status) => client.patch(`/documents/invoices/${id}/status`, { status });
export const duplicateInvoice = (id) => client.post(`/documents/invoices/${id}/duplicate`);
export const sendInvoiceViaChat = (id, message) => client.post(`/documents/invoices/${id}/send`, { message });

// Generic document access
export const getDocument = (id) => client.get(`/documents/${id}`);
export const documentPdfUrl = (id) => `${client.defaults.baseURL}/documents/${id}/pdf`;
export const raiseDispute = (id, reason) => client.post(`/documents/${id}/dispute`, { reason });

// Verification (public — no auth required, but calling through the
// authenticated client is harmless since optionalAuth accepts either)
export const verifyDocument = (code) => client.get(`/documents/verify/${code}`);

// Business statements
export const generateStatement = (payload) => client.post('/documents/statements/generate', payload);
export const myStatements = () => client.get('/documents/statements/mine');

// AI Invoice Assistant
export const aiCreateInvoiceFromOrder = (orderId, extra) => client.post('/documents/ai/create-from-order', { orderId, ...extra });
export const aiExplainDocument = (id) => client.post(`/documents/ai/explain/${id}`);
export const aiDetectIssues = (id) => client.post(`/documents/ai/detect-issues/${id}`);
export const aiSummarizeSales = (payload) => client.post('/documents/ai/summarize-sales', payload || {});
export const aiMonthlyReport = (payload) => client.post('/documents/ai/monthly-report', payload || {});
