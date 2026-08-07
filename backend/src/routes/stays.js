import express from 'express';
import {
  searchProperties, getPropertyDetail,
  myProperties, createProperty, updateProperty, setPropertyPauseState, deleteProperty,
  addPropertyMedia, deletePropertyMedia, setCoverMedia, reorderPropertyMedia,
  getAvailability, setAvailability,
  listPricingRules, createPricingRule, updatePricingRule, deletePricingRule,
  listSpecialOffers, createSpecialOffer, deleteSpecialOffer,
  adminListPending, adminReviewProperty,
} from '../controllers/staysController.js';
import {
  createBooking, submitBookingPayment, myBookingsAsGuest, myBookingsAsHost, cancelBooking,
  adminListPendingPayments, adminConfirmBookingPayment, adminRejectBookingPayment, completeBookingAndPayout,
} from '../controllers/staysBookingController.js';
import {
  getPassForBooking, getPassPdf, verifyPassByCode, verifyPassByShareToken,
  createShareLink, listShareLinks, revokeShareLink, adminRevokePass,
} from '../controllers/staysPassController.js';
import {
  toggleSavedProperty, listSavedProperties, getGuestOverview, getHostOverview,
} from '../controllers/staysDashboardController.js';
import {
  listPropertyReviews, getReviewEligibility, createReview, replyToReview, listHostReviews,
  getHostTrust, adminSetPropertyBadge, adminSetHostBadge,
} from '../controllers/staysReviewController.js';
import { requireAuth, requireRole, optionalAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Hosts are the 'host' role (phase50) plus manufacturer/supplier/etc.
// businesses that also run accommodation are out of scope for phase A —
// same one-role-per-listing-surface pattern agriculture/B2B use.
const HOST_ROLES = ['host'];

// ---- Public browse (optionalAuth so an owner/admin previewing their
// own non-active listing still gets it back; see getPropertyDetail) ----
router.get('/properties', searchProperties);
router.get('/properties/:id', optionalAuth, getPropertyDetail);

// ---- Host: property CRUD ----
router.get('/my-properties', requireAuth, requireRole(...HOST_ROLES), myProperties);
router.post('/properties', requireAuth, requireRole(...HOST_ROLES), createProperty);
router.patch('/properties/:id', requireAuth, requireRole(...HOST_ROLES), updateProperty);
router.patch('/properties/:id/visibility', requireAuth, requireRole(...HOST_ROLES), setPropertyPauseState);
router.delete('/properties/:id', requireAuth, requireRole(...HOST_ROLES), deleteProperty);

// ---- Host: media gallery ----
router.post('/properties/:id/media', requireAuth, requireRole(...HOST_ROLES), addPropertyMedia);
router.delete('/properties/:id/media/:mediaId', requireAuth, requireRole(...HOST_ROLES), deletePropertyMedia);
router.patch('/properties/:id/media/:mediaId/cover', requireAuth, requireRole(...HOST_ROLES), setCoverMedia);
router.patch('/properties/:id/media/reorder', requireAuth, requireRole(...HOST_ROLES), reorderPropertyMedia);

// ---- Availability calendar (public read for a booking widget later; write is host-only) ----
router.get('/properties/:id/availability', getAvailability);
router.put('/properties/:id/availability', requireAuth, requireRole(...HOST_ROLES), setAvailability);

// ---- Seasonal / weekend / holiday pricing rules (host-only; not public) ----
router.get('/properties/:id/pricing-rules', requireAuth, requireRole(...HOST_ROLES), listPricingRules);
router.post('/properties/:id/pricing-rules', requireAuth, requireRole(...HOST_ROLES), createPricingRule);
router.patch('/properties/:id/pricing-rules/:ruleId', requireAuth, requireRole(...HOST_ROLES), updatePricingRule);
router.delete('/properties/:id/pricing-rules/:ruleId', requireAuth, requireRole(...HOST_ROLES), deletePricingRule);

// ---- Special offers ----
router.get('/properties/:id/offers', requireAuth, requireRole(...HOST_ROLES), listSpecialOffers);
router.post('/properties/:id/offers', requireAuth, requireRole(...HOST_ROLES), createSpecialOffer);
router.delete('/properties/:id/offers/:offerId', requireAuth, requireRole(...HOST_ROLES), deleteSpecialOffer);

// ---- Admin: lightweight review queue (Property Operations Division is Phase F) ----
router.get('/admin/pending', requireAuth, requireAdmin, adminListPending);
router.patch('/admin/properties/:id/review', requireAuth, requireAdmin, adminReviewProperty);

// ---- Guest: booking + payment (Phase B) ----
// Any authenticated buyer can book — a stay doesn't require the 'host' role,
// same as any buyer being able to place a product order without being a seller.
router.post('/properties/:id/bookings', requireAuth, createBooking);
router.post('/bookings/:id/submit-payment', requireAuth, submitBookingPayment);
router.get('/my-bookings', requireAuth, myBookingsAsGuest);
router.patch('/bookings/:id/cancel', requireAuth, cancelBooking);

// ---- Host: bookings on their properties ----
router.get('/host/bookings', requireAuth, requireRole(...HOST_ROLES), myBookingsAsHost);
router.patch('/bookings/:id/complete', requireAuth, requireRole(...HOST_ROLES), completeBookingAndPayout);

// ---- Admin: escrow verification + payout release ----
router.get('/admin/bookings/pending-payments', requireAuth, requireAdmin, adminListPendingPayments);
router.patch('/admin/bookings/:id/confirm-payment', requireAuth, requireAdmin, adminConfirmBookingPayment);
router.patch('/admin/bookings/:id/reject-payment', requireAuth, requireAdmin, adminRejectBookingPayment);
router.patch('/admin/bookings/:id/complete', requireAuth, requireAdmin, completeBookingAndPayout);

// ---- Digital Stay Pass (Phase C) ----
router.get('/bookings/:id/pass', requireAuth, getPassForBooking);
router.get('/bookings/:id/pass/pdf', requireAuth, getPassPdf);
router.post('/passes/:id/share', requireAuth, createShareLink);
router.get('/passes/:id/shares', requireAuth, listShareLinks);
router.patch('/passes/:id/shares/:shareId/revoke', requireAuth, revokeShareLink);
router.patch('/admin/passes/:id/revoke', requireAuth, requireAdmin, adminRevokePass);

// Public verification — no auth, never exposes payment details.
router.get('/verify/:code', verifyPassByCode);
router.get('/verify/share/:token', verifyPassByShareToken);

// ---- Dashboards (Phase D) ----
router.post('/saved/:propertyId/toggle', requireAuth, toggleSavedProperty);
router.get('/saved', requireAuth, listSavedProperties);
router.get('/guest/overview', requireAuth, getGuestOverview);
router.get('/host/overview', requireAuth, requireRole(...HOST_ROLES), getHostOverview);

// ---- Reviews (Phase E) ----
router.get('/properties/:id/reviews', listPropertyReviews);
router.get('/bookings/:id/review-eligibility', requireAuth, getReviewEligibility);
router.post('/bookings/:id/review', requireAuth, createReview);
router.patch('/reviews/:id/reply', requireAuth, requireRole(...HOST_ROLES), replyToReview);
router.get('/host/reviews', requireAuth, requireRole(...HOST_ROLES), listHostReviews);

// ---- Trust badges (Phase E) ----
router.get('/hosts/:userId/trust', getHostTrust);
router.patch('/admin/properties/:id/badges', requireAuth, requireAdmin, adminSetPropertyBadge);
router.patch('/admin/hosts/:userId/badges', requireAuth, requireAdmin, adminSetHostBadge);

export default router;
