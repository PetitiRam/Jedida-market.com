import express from 'express';
import {
  listQuoteMessages, sendQuoteMessage,
  createPurchaseAgreement, myPurchaseAgreements, getPurchaseAgreement, respondPurchaseAgreement, checkoutPurchaseAgreement,
  myInvoices, getInvoice, issueInvoiceForOrder
} from '../controllers/bulkOrderController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ---- RFQ negotiation thread (on top of quote_requests, phase41) ----
router.get('/quotes/:id/messages', requireAuth, listQuoteMessages);
router.post('/quotes/:id/messages', requireAuth, sendQuoteMessage);

// ---- Purchase agreements ----
router.post('/agreements', requireAuth, createPurchaseAgreement);
router.get('/agreements', requireAuth, myPurchaseAgreements);
router.get('/agreements/:id', requireAuth, getPurchaseAgreement);
router.patch('/agreements/:id', requireAuth, respondPurchaseAgreement);
router.post('/agreements/:id/checkout', requireAuth, checkoutPurchaseAgreement);

// ---- Bulk invoices ----
router.get('/invoices', requireAuth, myInvoices);
router.get('/invoices/:id', requireAuth, getInvoice);
router.post('/orders/:orderId/invoice', requireAuth, issueInvoiceForOrder);

export default router;
