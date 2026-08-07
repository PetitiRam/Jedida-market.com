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

const router = express.Router();

// ---- Manufacturer/Supplier own-catalog management ----
router.get('/business-profile', requireAuth, requireRole(...B2B_ROLES), getMyBusinessProfile);
router.patch('/business-profile', requireAuth, requireRole(...B2B_ROLES), updateMyBusinessProfile);

router.get('/products/:productId/tiers', listTiers); // public — shown on the storefront
router.put('/products/:productId/tiers', requireAuth, requireRole(...B2B_ROLES), replaceTiers);

router.get('/products/:productId/certificates', listCertificates); // public — shown on the storefront
router.post('/products/:productId/certificates', requireAuth, requireRole(...B2B_ROLES), addCertificate);
router.delete('/certificates/:certificateId', requireAuth, requireRole(...B2B_ROLES), deleteCertificate);

router.get('/analytics', requireAuth, requireRole(...B2B_ROLES), getBusinessAnalytics);

// ---- Quote requests (any buyer -> a manufacturer/supplier storefront) ----
router.post('/quotes', requireAuth, createQuoteRequest);
router.get('/quotes/mine', requireAuth, myQuoteRequests);
router.get('/quotes/incoming', requireAuth, requireRole(...B2B_ROLES), incomingQuoteRequests);
router.patch('/quotes/:id/respond', requireAuth, requireRole(...B2B_ROLES), respondToQuote);
router.patch('/quotes/:id/decline', requireAuth, declineQuote);
router.post('/quotes/:id/accept', requireAuth, acceptQuote);

export default router;
