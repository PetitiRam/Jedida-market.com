import client from './client';

export function uploadPartnerDocument(file, docType, onUploadProgress) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('docType', docType);
  return client.post('/partners/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  });
}

export function submitPartnerApplication(payload) {
  return client.post('/partners/apply', payload);
}

// Admin
export function listPartnerApplications(params) {
  return client.get('/admin/partners', { params });
}

export function getPartnerApplication(id) {
  return client.get(`/admin/partners/${id}`);
}

export function reviewPartnerApplication(id, decision, notes) {
  return client.patch(`/admin/partners/${id}`, { decision, notes });
}

export function bulkReviewPartnerApplications(ids, decision, notes) {
  return client.patch('/admin/partners/bulk', { ids, decision, notes });
}

export function assignPartnerReviewer(id, reviewerId) {
  return client.patch(`/admin/partners/${id}/assign-reviewer`, { reviewerId });
}

export function addPartnerApplicationNote(id, note) {
  return client.post(`/admin/partners/${id}/notes`, { note });
}

export function listPartnerReviewers() {
  return client.get('/admin/partners/reviewers');
}

export function suspendPartnership(id, reason) {
  return client.patch(`/admin/partners/${id}/suspend`, { reason });
}

export function reactivatePartnership(id) {
  return client.patch(`/admin/partners/${id}/reactivate`);
}

export function exportPartnerApplications(params) {
  return client.get('/admin/partners/export', { params, responseType: 'blob' });
}
