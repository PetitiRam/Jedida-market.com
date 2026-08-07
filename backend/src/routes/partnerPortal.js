import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  getDashboard,
  getCompanyProfile, updateCompanyProfile, uploadCompanyLogo, requestProfileChange,
  addContact, updateContact, deleteContact,
  listApiKeys, generateApiKeyHandler, regenerateApiKey, revokeApiKey,
  listWebhooks, createWebhook, updateWebhook, deleteWebhook,
  getSandboxSample, listSandboxLogs, testApiConnection, testWebhook,
  listTickets, createTicket, getTicket, replyToTicket, updateTicketStatus,
  getAuditLog,
  getDirectoryListing, updateDirectoryListing,
  getDropshippingProgram, updateDropshippingProgram
} from '../controllers/partnerPortalController.js';
import { requireAuth, requirePartner } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Generating/regenerating keys and firing sandbox tests are the actions
// most worth rate-limiting here — everything else is read-mostly.
const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down and try again.' }
});

const apiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: { error: 'Too many API key requests. Please wait a few minutes before trying again.' }
});

const router = express.Router();
router.use(requireAuth, requirePartner);

// Dashboard
router.get('/dashboard', getDashboard);

// Company profile
router.get('/company-profile', getCompanyProfile);
router.patch('/company-profile', updateCompanyProfile);
router.post('/company-profile/logo', upload.single('file'), uploadCompanyLogo);
router.post('/company-profile/change-requests', requestProfileChange);
router.post('/company-profile/contacts', addContact);
router.patch('/company-profile/contacts/:contactId', updateContact);
router.delete('/company-profile/contacts/:contactId', deleteContact);

// Integration Center
router.get('/api-keys', listApiKeys);
router.post('/api-keys', apiKeyLimiter, generateApiKeyHandler);
router.post('/api-keys/:id/regenerate', apiKeyLimiter, regenerateApiKey);
router.delete('/api-keys/:id', revokeApiKey);

router.get('/webhooks', listWebhooks);
router.post('/webhooks', createWebhook);
router.patch('/webhooks/:id', updateWebhook);
router.delete('/webhooks/:id', deleteWebhook);

// Sandbox
router.get('/sandbox/sample', getSandboxSample);
router.get('/sandbox/logs', listSandboxLogs);
router.post('/sandbox/test-api', actionLimiter, testApiConnection);
router.post('/sandbox/webhooks/:id/test', actionLimiter, testWebhook);

// Support
router.get('/support/tickets', listTickets);
router.post('/support/tickets', createTicket);
router.get('/support/tickets/:id', getTicket);
router.post('/support/tickets/:id/messages', upload.single('file'), replyToTicket);
router.patch('/support/tickets/:id', updateTicketStatus);

// Audit log
router.get('/audit-log', getAuditLog);

// Public "Partner Apps" directory listing settings + leads
router.get('/directory-listing', getDirectoryListing);
router.patch('/directory-listing', updateDirectoryListing);

// Dropshipping program setup
router.get('/dropshipping', getDropshippingProgram);
router.patch('/dropshipping', updateDropshippingProgram);

export default router;
