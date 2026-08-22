import client from './client';

export const getOrderMetrics = (params) => client.get('/analytics/orders', { params });
export const getQuoteConversionMetrics = () => client.get('/analytics/quote-conversion');
export const getDemandMetrics = () => client.get('/analytics/demand');
export const getDisputeMetrics = () => client.get('/analytics/disputes');
export const getAgentPerformance = () => client.get('/analytics/agent-performance');
export const getSupplierPerformance = () => client.get('/analytics/supplier-performance');
export const getDropshipperPerformance = () => client.get('/analytics/dropshipper-performance');
