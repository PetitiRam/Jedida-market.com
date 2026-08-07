import client from './client';

export const createCoupon = (payload) => client.post('/coupons', payload);
export const myCoupons = () => client.get('/coupons/mine');
export const validateCoupon = (code, shopId, subtotal) => client.post('/coupons/validate', { code, shopId, subtotal });
