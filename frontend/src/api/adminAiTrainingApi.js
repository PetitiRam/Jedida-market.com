import client from './client';

const base = '/admin/ai-training';

export const adminAiTrainingApi = {
  // Knowledge Library
  listKnowledge: (params) => client.get(`${base}/knowledge`, { params }),
  getKnowledge: (id) => client.get(`${base}/knowledge/${id}`),
  createKnowledge: (body) => client.post(`${base}/knowledge`, body),
  updateKnowledge: (id, body) => client.patch(`${base}/knowledge/${id}`, body),
  submitForReview: (id) => client.post(`${base}/knowledge/${id}/submit-review`),
  reviewKnowledge: (id, decision, notes) => client.post(`${base}/knowledge/${id}/review`, { decision, notes }),
  archiveKnowledge: (id) => client.post(`${base}/knowledge/${id}/archive`),
  newVersion: (id, body) => client.post(`${base}/knowledge/${id}/new-version`, body),
  uploadFile: (formData) => client.post(`${base}/knowledge/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),

  // Published
  listPublished: (params) => client.get(`${base}/published`, { params }),

  // Jobs / Training history
  listJobs: () => client.get(`${base}/jobs`),
  createJob: (body) => client.post(`${base}/jobs`, body),
  getJob: (id) => client.get(`${base}/jobs/${id}`),

  // Pending approval
  listPendingApprovals: () => client.get(`${base}/pending-approval`),
  reviewSuggestion: (id, decision, notes) => client.patch(`${base}/suggestions/${id}`, { decision, notes }),
  reviewCorrection: (id, decision, notes, collection) => client.patch(`${base}/corrections/${id}`, { decision, notes, collection }),

  // Suggested knowledge / gaps
  listGaps: (params) => client.get(`${base}/gaps`, { params }),
  dismissGap: (id) => client.patch(`${base}/gaps/${id}/dismiss`),

  // Performance
  getPerformance: () => client.get(`${base}/performance`),
};

export const KNOWLEDGE_COLLECTIONS = [
  { value: 'general_marketplace', label: 'General Marketplace' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'payments', label: 'Payments' },
  { value: 'seller_success', label: 'Seller Success' },
  { value: 'buyer_support', label: 'Buyer Support' },
  { value: 'admin_operations', label: 'Admin Operations' },
];

export const KNOWLEDGE_SOURCE_TYPES = [
  { value: 'help_article', label: 'Help Article' },
  { value: 'documentation', label: 'Marketplace Documentation' },
  { value: 'product_catalog', label: 'Product Catalog' },
  { value: 'policy', label: 'Platform Policy' },
  { value: 'faq', label: 'Admin-Approved FAQ' },
  { value: 'training_manual', label: 'Training Manual' },
  { value: 'seller_guide', label: 'Seller Guide' },
  { value: 'agriculture_knowledge', label: 'Agriculture Knowledge' },
  { value: 'wholesale_doc', label: 'Wholesale Documentation' },
  { value: 'delivery_procedure', label: 'Delivery Procedure' },
  { value: 'support_correction', label: 'Support Correction' },
  { value: 'other', label: 'Other' },
];
