import client from './client';

export const browseCatalog = (params) => client.get('/sourcing/catalog', { params });

export const requestConnection = (partnerId, message) =>
  client.post('/sourcing/connections', { partnerId, message });
export const myConnections = () => client.get('/sourcing/connections');
export const respondConnection = (id, status, responseNote) =>
  client.patch(`/sourcing/connections/${id}`, { status, responseNote });

export const createSourcingRequest = (payload) => client.post('/sourcing/requests', payload);
export const mySourcingRequests = () => client.get('/sourcing/requests');
export const respondSourcingRequest = (id, status, responseNote) =>
  client.patch(`/sourcing/requests/${id}`, { status, responseNote });

export const importProduct = (sourceProductId, marginType, marginValue) =>
  client.post('/sourcing/import', { sourceProductId, marginType, marginValue });
export const bulkImportProducts = (items) => client.post('/sourcing/import/bulk', { items });
export const myImports = () => client.get('/sourcing/imports');
export const updateImport = (id, payload) => client.patch(`/sourcing/imports/${id}`, payload);
export const removeImport = (id) => client.delete(`/sourcing/imports/${id}`);
