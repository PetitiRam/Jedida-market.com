import client from './client';

export const adminListWantedPosts = (params) => client.get('/admin/wanted/posts', { params });
export const adminRemoveWantedPost = (id, reason) => client.patch(`/admin/wanted/posts/${id}/remove`, { reason });
export const adminRestoreWantedPost = (id) => client.patch(`/admin/wanted/posts/${id}/restore`);
export const adminListWantedSecurityEvents = (params) => client.get('/admin/wanted/security-events', { params });
