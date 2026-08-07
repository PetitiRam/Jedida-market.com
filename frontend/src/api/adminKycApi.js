import client from './client';

export const getStats = () => client.get('/admin/kyc-review/stats');

export const listSubmissions = (params) => client.get('/admin/kyc-review/submissions', { params });

export const getSubmission = (id) => client.get(`/admin/kyc-review/submissions/${id}`);

export const reviewSubmission = (id, action, notes) =>
  client.patch(`/admin/kyc-review/submissions/${id}`, { action, notes });

export const assignReviewer = (id, assignTo) =>
  client.patch(`/admin/kyc-review/submissions/${id}`, { action: 'assign', assignTo });

export const addNote = (id, note) => client.post(`/admin/kyc-review/submissions/${id}/notes`, { note });
