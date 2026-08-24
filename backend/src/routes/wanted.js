import express from 'express';
import {
  createWantedRequest, myWantedRequests, getWantedRequest, cancelWantedRequest,
  incomingWantedMatches, respondToWantedMatch, submitWantedQuote, submitWantedOffer,
  acceptWantedQuote, declineWantedQuote, toggleWantedLike,
  getWantedFeed, postWantedReply, listWantedQuoteMessages, sendWantedQuoteMessage
} from '../controllers/wantedController.js';
import { B2B_ROLES } from '../controllers/b2bCatalogController.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// ---- Public feed (brief §9/§10) — optionalAuth: liked_by_me only
// populates when signed in; the feed itself never requires it. Must be
// registered before '/:id' or Express would treat "feed" as an id. ----
router.get('/feed', optionalAuth, getWantedFeed);

// ---- Buyer side — "Post What I Want" ----
router.post('/', requireAuth, createWantedRequest);
router.get('/mine', requireAuth, myWantedRequests);
router.get('/:id', optionalAuth, getWantedRequest); // public posts are viewable signed-out; private ones still gated inside the controller
router.patch('/:id/cancel', requireAuth, cancelWantedRequest);
router.post('/quotes/:quoteId/accept', requireAuth, acceptWantedQuote);
router.post('/quotes/:quoteId/decline', requireAuth, declineWantedQuote);
router.get('/quotes/:quoteId/messages', requireAuth, listWantedQuoteMessages);   // negotiation (brief §28)
router.post('/quotes/:quoteId/messages', requireAuth, sendWantedQuoteMessage);
router.post('/:id/like', requireAuth, toggleWantedLike); // social engagement only — never an order (brief §22)
router.post('/:id/replies', requireAuth, postWantedReply);
router.post('/:id/offers', requireAuth, requireRole(...B2B_ROLES), submitWantedOffer); // direct Offer on a public post (brief §18)

// ---- Business side — manufacturer/supplier/farmer accounts Jedida matched ----
router.get('/matches/incoming', requireAuth, requireRole(...B2B_ROLES), incomingWantedMatches);
router.patch('/matches/:matchId/respond', requireAuth, requireRole(...B2B_ROLES), respondToWantedMatch);
router.post('/quotes', requireAuth, requireRole(...B2B_ROLES), submitWantedQuote);

export default router;
