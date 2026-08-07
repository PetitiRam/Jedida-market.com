import express from 'express';

import {
  getSettings,
  getSettingsSection,
  updateSettingsSection,
  updatePlatformIdentity,
  updatePlatformBranding,
  getSettingsAudit,

  getLegalDocs,
  getLegalDoc,
  updateLegalDoc,

  getAboutSystem,
  createDatabaseBackup,
  listDatabaseBackups,
  restoreDatabaseBackup,
  getMaintenanceStatus
} from '../controllers/settingsCenterController.js';

import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

/* =========================================================
   PROTECTION (ADMIN ONLY)
========================================================= */

router.use(requireAuth);
router.use(requireAdmin);

/* =========================================================
   CORE SETTINGS
========================================================= */

router.get('/', getSettings);

/* =========================================================
   IDENTITY & BRANDING
========================================================= */

router.patch('/identity', updatePlatformIdentity);
router.patch('/branding', updatePlatformBranding);

/* =========================================================
   SETTINGS SECTIONS (JSONB)
========================================================= */

router.get('/section/:section', getSettingsSection);
router.patch('/section/:section', updateSettingsSection);

/* =========================================================
   AUDIT LOG
========================================================= */

router.get('/audit', getSettingsAudit);

/* =========================================================
   LEGAL DOCUMENTS
========================================================= */

router.get('/legal', getLegalDocs);
router.get('/legal/:docType', getLegalDoc);
router.put('/legal/:docType', updateLegalDoc);

/* =========================================================
   SYSTEM INFO
========================================================= */

router.get('/system/about', getAboutSystem);
router.get('/system/maintenance', getMaintenanceStatus);

/* =========================================================
   BACKUPS
========================================================= */

router.get('/system/backups', listDatabaseBackups);
router.post('/system/backups', createDatabaseBackup);
router.post('/system/restore', restoreDatabaseBackup);

/* =========================================================
   EXPORT
========================================================= */

export default router;
