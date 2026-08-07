import express from 'express';
import rateLimit from 'express-rate-limit';
import { stripeWebhook, flutterwaveWebhook, coinbaseWebhook, dpoWebhook } from '../controllers/paymentWebhooksController.js';

const router = express.Router();

// Generous but real ceiling — legitimate providers can retry a webhook
// several times, but there's no reason any single provider needs
// thousands of calls a minute against one JEDIDA deployment.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
router.use(webhookLimiter);

// express.raw() here (not express.json()) is what makes signature
// verification possible at all — see the comment at the top of
// paymentWebhooksController.js. These routes must stay mounted before
// app.use(express.json()) in server.js.
router.post('/stripe', express.raw({ type: 'application/json' }), stripeWebhook);
router.post('/flutterwave', express.raw({ type: 'application/json' }), flutterwaveWebhook);
router.post('/coinbase', express.raw({ type: 'application/json' }), coinbaseWebhook);
// DPO posts back application/x-www-form-urlencoded and isn't
// HMAC-verified (see dpoWebhook) — parsed normally, not as raw bytes.
router.post('/dpo', express.urlencoded({ extended: false }), dpoWebhook);

export default router;
