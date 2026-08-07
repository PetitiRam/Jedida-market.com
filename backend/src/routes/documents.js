import express from 'express';
import * as ctrl from '../controllers/documentsController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Public verification — this is what a scanned QR code / typed code hits.
router.get('/verify/:code', optionalAuth, ctrl.verifyDocument);

// Buyer Document Center
router.get('/buyer/history', requireAuth, ctrl.buyerHistory);
router.get('/buyer/receipts', requireAuth, ctrl.buyerReceipts);
router.get('/buyer/invoices', requireAuth, ctrl.buyerInvoices);
router.get('/buyer/refunds', requireAuth, ctrl.buyerRefunds);
router.get('/buyer/deliveries', requireAuth, ctrl.buyerDeliveries);

// Seller / Business Center
router.get('/seller/invoices', requireAuth, ctrl.sellerInvoices);
router.get('/seller/sales', requireAuth, ctrl.sellerSales);
router.get('/seller/pending-payments', requireAuth, ctrl.sellerPendingPayments);
router.get('/seller/revenue-report', requireAuth, ctrl.sellerRevenueReport);
router.get('/seller/customers/:customerId/history', requireAuth, ctrl.sellerCustomerHistory);

// Invoice CRUD (retail / wholesale / supplier / manufacturer / agriculture bulk / proforma / purchase order)
router.post('/invoices', requireAuth, ctrl.createInvoice);
router.patch('/invoices/:id', requireAuth, ctrl.updateInvoice);
router.patch('/invoices/:id/status', requireAuth, ctrl.updateInvoiceStatus);
router.post('/invoices/:id/duplicate', requireAuth, ctrl.duplicateInvoice);
router.post('/invoices/:id/send', requireAuth, ctrl.sendInvoiceViaChat);

// Business statements
router.post('/statements/generate', requireAuth, ctrl.generateStatement);
router.get('/statements/mine', requireAuth, ctrl.myStatements);

// AI Invoice Assistant
router.post('/ai/create-from-order', requireAuth, ctrl.aiCreateFromOrder);
router.post('/ai/explain/:id', requireAuth, ctrl.aiExplain);
router.post('/ai/detect-issues/:id', requireAuth, ctrl.aiDetectIssues);
router.post('/ai/summarize-sales', requireAuth, ctrl.aiSummarizeSales);
router.post('/ai/monthly-report', requireAuth, ctrl.aiMonthlyReport);

// Generic document access (kept below the more specific routes above)
router.get('/:id/pdf', requireAuth, ctrl.getDocumentPdf);
router.post('/:id/dispute', requireAuth, ctrl.raiseDispute);
router.get('/:id', requireAuth, ctrl.getInvoice);

export default router;
