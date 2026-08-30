import client from './client';

export const getPosSetup = () => client.get('/pos/setup');
export const savePosSetup = (payload) => client.post('/pos/setup', payload);

export const listRegisters = (shopId) => client.get('/pos/registers', { params: shopId ? { shopId } : {} });
export const createRegister = (payload) => client.post('/pos/registers', payload);
export const openRegister = (registerId, openingCashAmount) => client.post(`/pos/registers/${registerId}/open`, { openingCashAmount });
export const closeRegister = (registerId, closingCashAmount) => client.post(`/pos/registers/${registerId}/close`, { closingCashAmount });

export const listStaff = () => client.get('/pos/staff');
export const addStaff = (payload) => client.post('/pos/staff', payload);
export const deactivateStaff = (staffId) => client.post(`/pos/staff/${staffId}/deactivate`);

export const searchPosProducts = (params) => client.get('/pos/products/search', { params });
export const listPosPaymentMethods = (shopId) => client.get('/pos/payment-methods', { params: { shopId } });

export const createSale = (payload) => client.post('/pos/sales', payload);

export const getTodaySalesSummary = (shopId) => client.get('/pos/analytics/today', { params: { shopId } });
