import client from '../../api/client';

const base = '/admin/settings-center';

export const getAllSettings = () => client.get(`${base}/all`);
export const updateIdentity = (patch) => client.patch(`${base}/identity`, patch);
export const updateBranding = (patch) => client.patch(`${base}/branding`, patch);

export const getSection = (section) => client.get(`${base}/section/${section}`);
export const updateSection = (section, patch) => client.patch(`${base}/section/${section}`, patch);

export const getAuditLog = (section) => client.get(`${base}/audit-log`, { params: { section } });

export const listLegalDocuments = () => client.get(`${base}/legal`);
export const getLegalDocument = (docType) => client.get(`${base}/legal/${docType}`);
export const updateLegalDocument = (docType, contentMd) => client.put(`${base}/legal/${docType}`, { contentMd });

export const getSystemInfo = () => client.get(`${base}/system-info`);

export const createBackup = () => client.post(`${base}/backup`);
export const listBackups = () => client.get(`${base}/backups`);
export const restoreBackup = (filePath) => client.post(`${base}/restore`, { filePath });
