import express from 'express';
import {
  listApiKeys, createApiKey, revokeApiKey,
  listOAuthApps, createOAuthApp, suspendOAuthApp,
  listSandboxResources, createSandboxResource, resetSandbox, listResourceTypes,
} from '../controllers/developerApiKeysController.js';
import { requireAuth } from '../middleware/auth.js';

// Mounted at /api/dev — same base as developerPlatform.js (phase 50). Split
// into its own file/router purely for readability; both require the same
// requireAuth and both gate deeper access on an approved developer profile
// inside the controller, not the route table.
const router = express.Router();
router.use(requireAuth);

router.get('/api-keys', listApiKeys);
router.post('/api-keys', createApiKey);
router.post('/api-keys/:id/revoke', revokeApiKey);

router.get('/oauth-apps', listOAuthApps);
router.post('/oauth-apps', createOAuthApp);
router.post('/oauth-apps/:id/suspend', suspendOAuthApp);

router.get('/sandbox/resource-types', listResourceTypes);
router.get('/sandbox', listSandboxResources);
router.post('/sandbox', createSandboxResource);
router.post('/sandbox/reset', resetSandbox);

export default router;
