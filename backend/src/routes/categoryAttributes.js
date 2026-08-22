import express from 'express';
import { getSchemaForCategory, listAllSchemas, validateSpecs, adminUpsertSchema } from '../controllers/categoryAttributesController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, listAllSchemas);
router.get('/:category', requireAuth, getSchemaForCategory);
router.post('/validate', requireAuth, validateSpecs);
router.put('/admin', requireAuth, requirePermission('products'), adminUpsertSchema);

export default router;
