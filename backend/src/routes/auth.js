import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  registerStep1, registerStep2, login, googleAuth, refresh, logout, logoutAllSessions,
  forgotPassword, resetPassword, getMe, updateMyLanguage, updateMyLocation,
  listSessions, revokeSession, changePassword, getLoginHistory,
  setupTwoFactor, verifyTwoFactor, disableTwoFactor, verifyLoginTwoFactor
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// A 6-digit TOTP code is only ~1e6 possibilities — tighter than the
// password limiter above, on top of the per-account lockout in
// verifyLoginTwoFactor itself (two_factor_failed_count/locked_until).
const mfaLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Too many code attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many registration attempts. Please wait and try again.' }
});

// Password-reset request/completion previously only had the router-wide
// authLimiter (50/15min in server.js) protecting them — loose enough to
// let someone email-bomb an inbox with reset links, or brute-force a
// 48-char reset token across many requests before that window rolls over.
// Tight, dedicated limits close both gaps without affecting normal use
// (nobody legitimately requests more than a couple of resets in 15 min).
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'Too many password change attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Refresh tokens are opaque 12-byte-class secrets, not guessable — this
// limiter isn't about brute force, it's about capping how fast a stolen
// or leaked token can be hammered to mint new access tokens.
const refreshLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh attempts. Please wait and try again.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/register/step-1', registrationLimiter, registerStep1);
router.post('/register/step-2', registrationLimiter, registerStep2);

router.post('/login', loginLimiter, login);
router.post('/2fa/login-verify', mfaLoginLimiter, verifyLoginTwoFactor);
router.post('/google', loginLimiter, googleAuth);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', logout);
router.post('/logout-all', requireAuth, logoutAllSessions);
router.get('/sessions', requireAuth, listSessions);
router.delete('/sessions/:id', requireAuth, revokeSession);

router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

router.get('/me', requireAuth, getMe);
router.patch('/me/language', requireAuth, updateMyLanguage);
router.patch('/me/location', requireAuth, updateMyLocation);

router.post('/change-password', requireAuth, changePasswordLimiter, changePassword);
router.get('/login-history', requireAuth, getLoginHistory);
router.post('/2fa/setup', requireAuth, setupTwoFactor);
router.post('/2fa/verify', requireAuth, verifyTwoFactor);
router.post('/2fa/disable', requireAuth, disableTwoFactor);

export default router;
