import express from 'express';
import {
  createWantedRequest, myWantedRequests, getWantedRequest, cancelWantedRequest,
  incomingWantedMatches, respondToWantedMatch, submitWantedQuote,
  acceptWantedQuote, declineWantedQuote
} from '../controllers/wantedController.js';
import { B2B_ROLES } from '../controllers/b2bCatalogController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// ---- Buyer side — "Post What I Want" ----
router.post('/', requireAuth, createWantedRequest);
router.get('/mine', requireAuth, myWantedRequests);
router.get('/:id', requireAuth, getWantedRequest);
router.patch('/:id/cancel', requireAuth, cancelWantedRequest);
router.post('/quotes/:quoteId/accept', requireAuth, acceptWantedQuote);
router.post('/quotes/:quoteId/decline', requireAuth, declineWantedQuote);

// ---- Business side — manufacturer/supplier/farmer accounts Jedida matched ----
router.get('/matches/incoming', requireAuth, requireRole(...B2B_ROLES), incomingWantedMatches);
router.patch('/matches/:matchId/respond', requireAuth, requireRole(...B2B_ROLES), respondToWantedMatch);
router.post('/quotes', requireAuth, requireRole(...B2B_ROLES), submitWantedQuote);

export default router;
