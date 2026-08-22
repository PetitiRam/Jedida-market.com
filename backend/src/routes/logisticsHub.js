import express from 'express';
import {
  adminCreateProvider, listProviders, adminUpdateProvider,
  requestShippingQuote, myShippingQuotes, getShippingQuoteOptions, adminSubmitQuoteOption,
  createBooking, myBookings, getBookingTracking, adminAddTrackingEvent, adminListBookings
} from '../controllers/logisticsHubController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// ---- Provider directory — any authenticated user can browse it ----
router.get('/providers', requireAuth, listProviders);
router.post('/admin/providers', requireAuth, requirePermission('upgrades'), adminCreateProvider);
router.patch('/admin/providers/:id', requireAuth, requirePermission('upgrades'), adminUpdateProvider);

// ---- Quotes / rate comparison ----
router.post('/quotes', requireAuth, requestShippingQuote);
router.get('/quotes/mine', requireAuth, myShippingQuotes);
router.get('/quotes/:id/options', requireAuth, getShippingQuoteOptions);
router.post('/admin/quotes/options', requireAuth, requirePermission('upgrades'), adminSubmitQuoteOption);

// ---- Bookings + tracking ----
router.post('/bookings', requireAuth, createBooking);
router.get('/bookings/mine', requireAuth, myBookings);
router.get('/bookings/:id/tracking', requireAuth, getBookingTracking);
router.post('/admin/bookings/:id/tracking', requireAuth, requirePermission('upgrades'), adminAddTrackingEvent);
router.get('/admin/bookings', requireAuth, requirePermission('upgrades'), adminListBookings);

export default router;
