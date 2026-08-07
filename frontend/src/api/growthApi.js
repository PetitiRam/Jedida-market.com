import client from './client';

export const getGrowthDashboard = () => client.get('/growth/dashboard');
export const getSalesGrowthPlan = () => client.get('/growth/plan');
export const listGrowthActions = () => client.get('/growth/actions');
export const launchDiscountCampaign = (payload) => client.post('/growth/discount-campaign', payload);
export const launchPromoPost = (payload) => client.post('/growth/promo-post', payload);

// Admin
export const adminGrowthOverview = () => client.get('/admin/growth/overview');
