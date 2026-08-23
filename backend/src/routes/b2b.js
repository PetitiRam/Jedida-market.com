import express from 'express';
import {
  getMyBusinessProfile, updateMyBusinessProfile,
  listTiers, replaceTiers,
  listCertificates, addCertificate, deleteCertificate,
  getBusinessAnalytics, B2B_ROLES
} from '../controllers/b2bCatalogController.js';
import {
  createQuoteRequest, myQuoteRequests, incomingQuoteRequests,
  respondToQuote, declineQuote, acceptQuote
} from '../controllers/quoteController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeatureEnabled } from '../middleware/featureGate.js';

const router = express.Router();

// ---- Manufacturer/Supplier own-catalog management ----
// requireFeatureEnabled sits alongside the existing role check: role decides
// *who* could ever use B2B/wholesale, the feature engine decides whether
// it's actually switched on right now (globally, and for this specific
// shop) — same real 3-level gate as dropshipping (schema_phase85).
router.get('/business-profile', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('b2b'), getMyBusinessProfile);
router.patch('/business-profile', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('b2b'), updateMyBusinessProfile);

router.get('/products/:productId/tiers', listTiers); // public — shown on the storefront
router.put('/products/:productId/tiers', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('wholesale'), replaceTiers);

router.get('/products/:productId/certificates', listCertificates); // public — shown on the storefront
router.post('/products/:productId/certificates', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('b2b'), addCertificate);
router.delete('/certificates/:certificateId', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('b2b'), deleteCertificate);

router.get('/analytics', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('b2b'), getBusinessAnalytics);

// ---- Quote requests (any buyer -> a manufacturer/supplier storefront) ----
// createQuoteRequest/declineQuote/acceptQuote stay ungated here: the buyer
// is the caller on all three (declineQuote allows either side, but looks
// itself up by request row, not by the caller owning a shop), so there's
// no seller shop to check a feature against — gating would just 404 a
// buyer with no shop of their own. Only the seller-side "manage incoming
// quotes" actions are gated.
router.post('/quotes', requireAuth, createQuoteRequest);
router.get('/quotes/mine', requireAuth, myQuoteRequests);
router.get('/quotes/incoming', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('b2b'), incomingQuoteRequests);
router.patch('/quotes/:id/respond', requireAuth, requireRole(...B2B_ROLES), requireFeatureEnabled('b2b'), respondToQuote);
router.patch('/quotes/:id/decline', requireAuth, declineQuote);
router.post('/quotes/:id/accept', requireAuth, acceptQuote);

export default router;
