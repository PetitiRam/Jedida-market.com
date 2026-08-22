import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import { ipBlockGuard } from './middleware/ipBlockGuard.js';
import { apiTrafficCounter, recordBlockedTraffic } from './middleware/apiTrafficCounter.js';
import { maintenanceGate, partnerApiGate } from './middleware/platformLockdown.js';
import { recordRateLimitBlock } from './services/securityEventService.js';
import upgradeRoutes from './routes/upgrade.js';
import shopRoutes from './routes/shops.js';
import productRoutes from './routes/products.js';
import templateRoutes from './routes/templates.js';
import notificationRoutes from './routes/notifications.js';
import shareLinkPreviewRoutes from './routes/shareLinkPreview.js';
import orderRoutes from './routes/orders.js';
import walletRoutes from './routes/wallets.js';
import payoutMethodRoutes from './routes/payoutMethods.js';
import adminRoutes from './routes/admin.js';
import adsRoutes from './routes/ads.js';
import publicSettingsRoutes from './routes/publicSettings.js';
// import chatRoutes from './routes/chat.js'; // retired — see mount comment below
import deliveryRoutes from './routes/deliveryRoutes.js';
import petitiRoutes from '../ai/petiti/petitiRoutes.js';
import tausiRoutes from '../ai/tausi/tausiRoutes.js';
import publicPetitiRoutes from './routes/publicPetiti.js';
import uploadsRoutes from './routes/uploads.js';
import downloadsRoutes from './routes/downloads.js';
// near the other route imports:
import kycRoutes from './routes/kyc.js';
import adminKycReviewRoutes from './routes/adminKyc.js';
import settingsCenterRoutes from './routes/settingsCenter.js';
import publicSettingsCenterRoutes from './routes/publicSettingsCenter.js';
import reviewRoutes from './routes/reviews.js';
import http from 'http';
import https from 'https';
import fs from 'fs';

import { initChatSocket } from './chat/chatSocket.js';
import chatV2Routes from './routes/chatV2.js';
import commerceActionsRoutes from './routes/commerceActions.js';
import couponsRoutes from './routes/coupons.js';
import adminPaymentsRoutes from "./routes/adminPaymentsRoutes.js";
import homeRoutes from './routes/home.js';
import partnerRoutes, { adminPartnerRouter } from './routes/partners.js';
import partnerPortalRoutes from './routes/partnerPortal.js';
import partnerDirectoryRoutes from './routes/partnerDirectory.js';
import affiliateRoutes, { adminAffiliateRouter } from './routes/affiliate.js';
import sourcingRoutes from './routes/sourcing.js';
import aiBusinessRoutes from './routes/aiBusiness.js';
import b2bRoutes from './routes/b2b.js';
import dropshipRoutes from './routes/dropship.js';
import enterpriseRoutes from './routes/enterprise.js';
import bulkOrderRoutes from './routes/bulkOrders.js';
import trustSecurityRoutes from './routes/trustSecurity.js';
import profileRoutes from './routes/profile.js';
import shopBuilderRoutes from './routes/shopBuilder.js';
import aiAssistantRoutes from './routes/aiAssistant.js';
import representativeRoutes, { adminRepresentativeRouter } from './routes/representatives.js';
import aiHandlerRoutes, { adminAiHandlerRouter } from './routes/aiHandler.js';
import agricultureRoutes from './routes/agriculture.js';
import pushRoutes from './routes/push.js';
import documentsRoutes from './routes/documents.js';
import adminDocumentsRoutes from './routes/adminDocuments.js';
import aiTrainingRoutes from './routes/aiTraining.js';
import adminAiTrainingRoutes from './routes/adminAiTraining.js';
import developerPlatformRoutes, { adminDeveloperPlatformRouter } from './routes/developerPlatform.js';
import developerApiKeysRoutes from './routes/developerApiKeys.js';
import staysRoutes from './routes/stays.js';
import shopFeedRoutes from './routes/shopFeed.js';
import growthRoutes from './routes/growth.js';
import { publicRouter as marketplaceLayoutRoutes, adminRouter as marketplaceBuilderRoutes } from './routes/marketplaceBuilder.js';
import securityOpsRoutes from './routes/securityOps.js';
import paymentWebhookRoutes from './routes/paymentWebhooks.js';
import wantedRoutes from './routes/wanted.js';
import omnichannelRoutes from './routes/omnichannel.js';
import chinaTradeHubRoutes from './routes/chinaTradeHub.js';
import assignmentEngineRoutes from './routes/assignmentEngine.js';
import logisticsHubRoutes from './routes/logisticsHub.js';
import translationRoutes from './routes/translation.js';
import categoryAttributesRoutes from './routes/categoryAttributes.js';
import analyticsRoutes from './routes/analytics.js';
import { runSupplyContractCycleSweep } from './controllers/agricultureController.js';
import { runFullTrustAndProtectionSweep } from './services/trustEngineService.js';
import { autoReleaseExpiredEscrow } from './controllers/ordersController.js';
import { verifyRequestOrigin } from './middleware/csrfProtection.js';

dotenv.config();

// ----------------------------------------------------------------------
// Process-level safety net. Without these, ANY unhandled error anywhere
// in the app — a stray promise rejection in a route, an unlistened
// EventEmitter 'error' (e.g. the pg Pool's idle-client errors, see
// db.js), a bug in one of the background sweeps below — takes down the
// entire Node process, killing every in-flight request across every
// route, not just the one that misbehaved. That's what produced the
// dangling "GET /api/ads ... - - ms - -" log line: the process died
// mid-request, before morgan/the response could finish.
//
// These handlers are a last line of defense, not a substitute for
// fixing the actual bug — they log with full context and keep the
// server alive so a single bad request/connection doesn't cascade into
// a full outage. Anything caught here should still be tracked down and
// fixed at the source; this just stops it from being catastrophic in
// the meantime.
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 Unhandled Promise Rejection:', reason);
  console.error('   at promise:', promise);
  // Deliberately NOT calling process.exit() — an unhandled rejection in
  // one request/background job is recoverable; crashing the whole
  // server over it is strictly worse for uptime than logging it.
});

process.on('uncaughtException', (err, origin) => {
  console.error('🔴 Uncaught Exception:', err);
  console.error('   origin:', origin);
  // Node's own docs recommend NOT resuming normal operation after an
  // uncaughtException in general, since the process may be in an
  // inconsistent state. In practice, for this app the overwhelmingly
  // common cause is a synchronous throw or unhandled EventEmitter
  // 'error' from something non-critical (a logging call, a background
  // sweep, a stray pool event) rather than corrupted in-process state,
  // so we log and keep serving traffic rather than dropping every open
  // connection. If crashes here become frequent, that's a signal to
  // find and fix the specific unguarded call — not to remove this
  // handler, which would just restore the original all-or-nothing
  // failure mode.
});

const app = express();
app.set('trust proxy', 1); // required behind Railway/Render/Netlify-style reverse proxies

// CORS: an allowlist, never a bare wildcard combined with credentials —
// browsers reject that combination anyway, but relying on that is fragile.
// FRONTEND_URL may be a single origin or a comma-separated list (e.g. web +
// a staging preview URL) so multi-environment setups keep working.
// Computed above helmet() so the CSP's connect-src below can reference it.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Explicit security headers rather than helmet()'s bare defaults — CSP
// blocks injected/foreign scripts (XSS containment), frame-ancestors
// 'none' + frameguard deny stop this API ever being framed (clickjacking),
// and HSTS forces HTTPS on every future visit once a browser has seen it
// once. This is a JSON API, not the page host, so the CSP mainly protects
// the few HTML responses it does serve (shareLinkPreview's Open Graph
// pages, error pages) — cheap insurance, and it costs nothing on JSON
// responses since browsers don't apply CSP to XHR/fetch payloads.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", ...allowedOrigins],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // downloads/uploads routes are fetched cross-origin by the frontend
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true
}));

// Optional: redirect plain HTTP to HTTPS. Off by default so the common
// deployment (behind Railway/Render/Cloudflare, which already terminates
// TLS before traffic reaches this process) isn't affected — turn on with
// FORCE_HTTPS=true only when this server is the one terminating TLS itself
// (see the SSL_KEY_PATH/SSL_CERT_PATH block below) or when a proxy in
// front of it is *not* already enforcing this. req.secure reflects
// X-Forwarded-Proto correctly here because `trust proxy` is set above.
if (process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(cors({
  origin(origin, callback) {
    // Same-origin / non-browser requests (curl, mobile app, server-to-server)
    // send no Origin header at all — allow those through.
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
// Defense-in-depth beyond the CORS check above — see csrfProtection.js for
// why this matters even though the API is bearer-token, not cookie,
// authenticated.
app.use(verifyRequestOrigin(allowedOrigins));
// Denies known-bad IPs before any routing, parsing, or rate-limit
// counting happens — the first gate in the chain. See blocked_ips /
// securityEventService.js (Security Operations Dashboard, phase 68).
app.use(ipBlockGuard);
// Mounted BEFORE express.json(): webhook signature verification (Stripe,
// Coinbase Commerce) needs the exact raw bytes the provider sent, which
// express.json() would otherwise parse away before these handlers ever
// see the request. See routes/paymentWebhooks.js for the per-provider
// body parsing.
app.use('/api/webhooks', paymentWebhookRoutes);

// Default limit (100kb) is too small for the face-capture flow — a
// 640x640 JPEG selfie, base64-encoded, typically lands well above that
// (see components/security/SecurityFaceCapture.jsx, which posts it as
// req.body.faceCapture to any route behind requireFaceVerification).
// 2mb covers that comfortably while still being far below what would let
// someone use a JSON body as a general file-upload vector — real file
// uploads go through the dedicated multipart /api/uploads endpoint, not
// through this parser.
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Baseline abuse/bot protection across the whole API — auth and a few
// write-heavy routes layer tighter limiters of their own on top of this.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
  handler: (req, res, next, options) => {
    recordRateLimitBlock(req.ip || req.headers['x-forwarded-for'] || 'unknown', req.originalUrl);
    recordBlockedTraffic();
    res.status(options.statusCode).json(options.message);
  }
});
app.use('/api', apiTrafficCounter);
app.use('/api', maintenanceGate);
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many attempts. Please try again later.' },
  handler: (req, res, next, options) => {
    recordRateLimitBlock(req.ip || req.headers['x-forwarded-for'] || 'unknown', req.originalUrl);
    recordBlockedTraffic();
    res.status(options.statusCode).json(options.message);
  }
});

// Withdrawals move real money out of the platform — the blanket 240/min
// API limiter was the only thing standing between this endpoint and a
// scripted burst of withdrawal requests. requestWithdrawal already has
// its own 10-second duplicate-submission guard, but that only catches
// exact repeats of one amount/method; this caps distinct attempts too.
const withdrawalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many withdrawal requests. Please wait before trying again.' },
  handler: (req, res, next, options) => {
    recordRateLimitBlock(req.ip || req.headers['x-forwarded-for'] || 'unknown', req.originalUrl);
    recordBlockedTraffic();
    res.status(options.statusCode).json(options.message);
  }
});

// Changing a payout method is exactly as sensitive as a withdrawal
// itself — it's where the money from future withdrawals goes.
const payoutMethodLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payout method changes. Please wait before trying again.' },
  handler: (req, res, next, options) => {
    recordRateLimitBlock(req.ip || req.headers['x-forwarded-for'] || 'unknown', req.originalUrl);
    recordBlockedTraffic();
    res.status(options.statusCode).json(options.message);
  }
});

// Root-level route (not under /api): this is the actual link sellers share
// on social media — it serves Open Graph meta tags for crawlers, then
// redirects real visitors into the SPA. See routes/shareLinkPreview.js.
app.use(shareLinkPreviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/settings', publicSettingsRoutes);
// Legacy flat user<->admin chat thread endpoint retired (2026-08) — its
// only clients (ChatPanel.jsx on seller/delivery/upgrade pages, and
// AdminChatPanel.jsx) now run on chat-v2 (chatV2Routes below), which
// covers the same "message admin support" case via a seller_id-less
// conversation (see chatService.getOrCreateConversation) plus context,
// AI handoff, attachments, and moderation that this endpoint never had.
// Route/controller files left in place, just unreachable now.
// app.use('/api/chat', chatRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/upgrade', upgradeRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/products', productRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallets/withdraw', withdrawalLimiter);
app.use('/api/wallets', walletRoutes);
app.use('/api/payout-method', payoutMethodLimiter, payoutMethodRoutes);
// Real running version, read from the actual package.json via npm's env var
// (falls back to the package.json value itself when not started through
// npm). Used by the admin Mission Control top bar — never hardcoded.
app.get('/api/version', (req, res) => {
  res.json({ version: process.env.npm_package_version || '1.0.0', env: process.env.NODE_ENV || 'production' });
});

app.use('/api/ai/petiti', petitiRoutes);
app.use('/api/ai/tausi', tausiRoutes);
app.use('/api/site', publicPetitiRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/admin/kyc-review', adminKycReviewRoutes);
app.use('/api/admin/settings-center', settingsCenterRoutes);
app.use('/api/settings', publicSettingsCenterRoutes);
app.use("/api/admin/payments", adminPaymentsRoutes);
// Legacy direct buyer<->seller Q&A endpoint retired (2026-08) — no shipped
// client called it, and it let a seller answer a buyer directly,
// bypassing the admin-mediated moderation the newer Q&A flow
// (routes/reviews.js: /api/reviews/:productId/questions +
// /api/reviews/admin/questions/*) was built to enforce. Route/controller
// files left in place, just unreachable now.

app.use('/api/chat-v2', chatV2Routes);
app.use('/api', commerceActionsRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/admin/partners', adminPartnerRouter);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/admin/affiliate', adminAffiliateRouter);
app.use('/api/partner-portal', partnerApiGate, partnerPortalRoutes);
app.use('/api/partner-apps', partnerDirectoryRoutes);
app.use('/api/sourcing', sourcingRoutes);
app.use('/api/ai-business', aiBusinessRoutes);
app.use('/api/shop-builder', shopBuilderRoutes);
app.use('/api/ai-assistant', aiAssistantRoutes);
app.use('/api/b2b', b2bRoutes);
app.use('/api/dropship', dropshipRoutes);
app.use('/api/enterprise', enterpriseRoutes);
app.use('/api/bulk', bulkOrderRoutes);
app.use('/api/trust', trustSecurityRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/representatives', representativeRoutes);
app.use('/api/admin/representatives', adminRepresentativeRouter);
app.use('/api/ai-handler', aiHandlerRoutes);
app.use('/api/admin/ai-handler', adminAiHandlerRouter);
app.use('/api/agriculture', agricultureRoutes);
app.use('/api/push', pushRoutes);
// Digital Receipts & Invoice System — auto-generated receipts, business
// invoices, verification, and the buyer/seller document centers.
app.use('/api/documents', documentsRoutes);
app.use('/api/admin/documents', adminDocumentsRoutes);

// AI Training Center — controlled knowledge base the Jedida AI Assistant
// draws on (see src/services/aiKnowledgeLookup.js). Additive: the
// assistant's existing deterministic reply logic is unchanged.
app.use('/api/ai-training', aiTrainingRoutes);
app.use('/api/admin/ai-training', adminAiTrainingRoutes);
app.use('/api/dev', developerPlatformRoutes);
app.use('/api/dev', developerApiKeysRoutes);
app.use('/api/admin/dev', adminDeveloperPlatformRouter);

// Jedida Stays — Phase A (Foundation) + Phase B (Booking + Payments):
// property listings, media, availability calendar, seasonal/weekend/
// holiday pricing, offers, bookings, escrow/payout via wallets, Stay
// Pass/trust/admin-ops/AI/analytics land in later phases (see
// schema_phase50_stays_foundation.sql / schema_phase51_stays_bookings.sql).
app.use('/api/stays', staysRoutes);
app.use('/api/shop-feed', shopFeedRoutes);
app.use('/api/growth', growthRoutes);
app.use('/api/marketplace-layout', marketplaceLayoutRoutes);
app.use('/api/admin/marketplace', marketplaceBuilderRoutes);
app.use('/api/admin/security-ops', securityOpsRoutes);

// Native app shell binaries (.apk/.exe/.dmg/.AppImage) + the manifest the
// download page polls for real version/size info. Mounted outside /api so
// binary links stay plain, cacheable, CDN-friendly URLs.
app.use('/downloads', downloadsRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/wanted', wantedRoutes);
app.use('/api/omnichannel', omnichannelRoutes);
app.use('/api/china-trade-hub', chinaTradeHubRoutes);
app.use('/api/assignment-engine', assignmentEngineRoutes);
app.use('/api/logistics-hub', logisticsHubRoutes);
app.use('/api/translation', translationRoutes);
app.use('/api/category-attributes', categoryAttributesRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'JEDIDA Marketplace API', phase: 4 });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

// Replace your existing `app.listen(PORT, ...)` at the bottom with:
//
// Direct TLS termination is optional. Most deployments (Railway, Render,
// a Cloudflare/nginx front door) already terminate HTTPS before traffic
// reaches this process, so the default here is unchanged: plain HTTP,
// same as before this existed. Set SSL_KEY_PATH + SSL_CERT_PATH (e.g. when
// running standalone on a VPS, or for local HTTPS dev — the native shells'
// network_security_config.xml / ATS settings refuse cleartext traffic
// entirely, so pointing MOBILE_API_URL at a plain http:// backend during
// device testing won't work without this) to serve HTTPS directly instead.
const sslKeyPath = process.env.SSL_KEY_PATH;
const sslCertPath = process.env.SSL_CERT_PATH;
const sslEnabled = !!(sslKeyPath && sslCertPath && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath));

const httpServer = sslEnabled
  ? https.createServer({
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath),
      ca: process.env.SSL_CA_PATH && fs.existsSync(process.env.SSL_CA_PATH)
        ? fs.readFileSync(process.env.SSL_CA_PATH)
        : undefined
    }, app)
  : http.createServer(app);
initChatSocket(httpServer, process.env.FRONTEND_URL);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🟢 JEDIDA Marketplace API + real-time chat running on port ${PORT} (${sslEnabled ? 'https' : 'http'})`);
});

// ----------------------------------------------------------------------
// Escrow auto-release scheduler — the second approved release workflow
// (the first being admin-triggered releaseFunds after delivery
// confirmation). Runs the same guarded, audit-logged sweep exposed at
// POST /api/orders/escrow/auto-release, on a timer, so a buyer's
// protection period expiring doesn't require an admin to remember to
// click a button. Disable by setting ESCROW_AUTO_RELEASE_DISABLED=true
// (e.g. in a staging environment or while running a migration).
if (process.env.ESCROW_AUTO_RELEASE_DISABLED !== 'true') {
  const intervalMs = Number(process.env.ESCROW_AUTO_RELEASE_INTERVAL_MS) || 60 * 60 * 1000; // hourly by default
  const runSweep = async () => {
    try {
      const fakeRes = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) {
        if (body?.released) console.log(`⏱  Escrow auto-release: ${body.released} order(s), ${body.checked} checked.`);
        if (body?.errors?.length) console.warn('⏱  Escrow auto-release errors:', body.errors);
      } };
      await autoReleaseExpiredEscrow({ user: null }, fakeRes);
    } catch (err) {
      console.error('⏱  Escrow auto-release sweep failed:', err);
    }
  };
  setInterval(runSweep, intervalMs);
  // Run once shortly after boot too, so a restarted server doesn't wait a
  // full interval before catching up on anything that expired while down.
  setTimeout(runSweep, 30 * 1000);
}

// Supply contract cycle reminders (schema_phase45) — same pattern as the
// escrow sweep above: notifies buyer + supplier when a recurring
// agriculture contract's cycle is due, then advances next_delivery_date.
// Never auto-creates or auto-charges an order. Disable with
// AGRI_CONTRACT_SWEEP_DISABLED=true.
if (process.env.AGRI_CONTRACT_SWEEP_DISABLED !== 'true') {
  const agriIntervalMs = Number(process.env.AGRI_CONTRACT_SWEEP_INTERVAL_MS) || 24 * 60 * 60 * 1000; // daily by default
  const runAgriSweep = async () => {
    try {
      const { checked, notified } = await runSupplyContractCycleSweep();
      if (notified > 0) console.log(`🌾 Supply contract sweep: ${notified} of ${checked} due cycle(s) notified.`);
    } catch (err) {
      console.error('🌾 Supply contract sweep failed:', err);
    }
  };
  setInterval(runAgriSweep, agriIntervalMs);
  setTimeout(runAgriSweep, 45 * 1000);
}

// Verified Shop trust-engine sweep (schema_phase59) + AI Protection scans
// (schema_phase60) — recomputes every active shop's metrics, applies
// grant/revoke decisions, and runs the fake-follower/fake-review/
// suspicious-order/quality-decline detectors. Interval is admin-
// configurable (verified_shop_settings.recomputeIntervalMinutes); falls
// back to every 6 hours. Disable with VERIFIED_SHOP_SWEEP_DISABLED=true.
if (process.env.VERIFIED_SHOP_SWEEP_DISABLED !== 'true') {
  const runTrustSweep = async () => {
    try {
      const { engineSummary, protectionSummary } = await runFullTrustAndProtectionSweep();
      console.log(`✅ Verified Shop sweep: ${engineSummary.checked} shop(s) checked, ${engineSummary.granted} newly verified, ${engineSummary.revoked} revoked. AI 
Protection: ${protectionSummary.signalsRaised} risk signal(s), ${protectionSummary.flagsRaised} fraud flag(s) raised.`);
    } catch (err) {
      console.error('✅ Verified Shop sweep failed:', err);
    }
  };
  // Read the configured interval at boot; a change to the setting takes
  // effect on the next process restart, same as other sweep intervals here.
  const trustIntervalMs = Number(process.env.VERIFIED_SHOP_SWEEP_INTERVAL_MS) || 6 * 60 * 60 * 1000; // 6h default
  setInterval(runTrustSweep, trustIntervalMs);
  setTimeout(runTrustSweep, 60 * 1000);
}
