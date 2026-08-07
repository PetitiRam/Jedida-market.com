import client from './client';

export const getFarmProfile = (userId) => client.get(`/agriculture/farms/${userId}`);
export const updateMyFarmProfile = (payload) => client.patch('/agriculture/farms/me', payload);

export const createSupplyContract = (payload) => client.post('/agriculture/contracts', payload);
export const myContracts = () => client.get('/agriculture/contracts');
export const updateContractStatus = (id, payload) => client.patch(`/agriculture/contracts/${id}`, payload);

export const getReliabilityScore = (userId) => client.get(`/agriculture/reliability/${userId}`);

export const requestFarmPickup = (payload) => client.post('/agriculture/logistics/pickup', payload);
