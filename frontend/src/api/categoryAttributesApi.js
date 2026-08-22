import client from './client';

export const getSchemaForCategory = (category) => client.get(`/category-attributes/${category}`);
export const listAllSchemas = () => client.get('/category-attributes');
export const validateSpecs = (category, specs) => client.post('/category-attributes/validate', { category, specs });
export const adminUpsertSchema = (payload) => client.put('/category-attributes/admin', payload);
