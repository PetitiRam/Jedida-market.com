import express from 'express';
import {
  browseCatalog,
  requestConnection, myConnections, respondConnection,
  createSourcingRequest, mySourcingRequests, respondSourcingRequest,
  importProduct, bulkImportProducts, myImports, updateImport, removeImport,
  SOURCING_ROLES
} from '../controllers/sourcingController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Catalog — browsing a manufacturer/supplier's wholesale listings.
router.get('/catalog', requireAuth, requireRole(...SOURCING_ROLES), browseCatalog);

// Business connections — either side can initiate/respond, so only
// requireAuth here; ownership is enforced inside the controller.
router.post('/connections', requireAuth, requestConnection);
router.get('/connections', requireAuth, myConnections);
router.patch('/connections/:id', requireAuth, respondConnection);

// Sourcing requests — same pattern: both requester and target business use
// these endpoints, ownership enforced in the controller.
router.post('/requests', requireAuth, requireRole(...SOURCING_ROLES), createSourcingRequest);
router.get('/requests', requireAuth, mySourcingRequests);
router.patch('/requests/:id', requireAuth, respondSourcingRequest);

// Import workflow — only sellers/suppliers/dropshippers build a storefront
// out of someone else's catalog.
router.post('/import', requireAuth, requireRole(...SOURCING_ROLES), importProduct);
router.post('/import/bulk', requireAuth, requireRole(...SOURCING_ROLES), bulkImportProducts);
router.get('/imports', requireAuth, requireRole(...SOURCING_ROLES), myImports);
router.patch('/imports/:id', requireAuth, requireRole(...SOURCING_ROLES), updateImport);
router.delete('/imports/:id', requireAuth, requireRole(...SOURCING_ROLES), removeImport);

export default router;
