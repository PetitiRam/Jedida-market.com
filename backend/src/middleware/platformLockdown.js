import { getLockdownState } from '../services/platformLockdownService.js';
import { recordBlockedTraffic } from './apiTrafficCounter.js';

// Mounted globally at app.use('/api', maintenanceGate) — so req.path here
// is already relative to '/api'. Admin and auth traffic always stays
// reachable: admins must always be able to sign in and turn maintenance
// back off, and the login route enforces its own separate loginDisabled
// check (with a super-admin exemption) rather than being blocked here.
export async function maintenanceGate(req, res, next) {
  if (req.path.startsWith('/admin') || req.path.startsWith('/auth') || req.path === '/version') return next();
  try {
    const state = await getLockdownState();
    if (state.maintenanceMode) {
      recordBlockedTraffic();
      return res.status(503).json({
        error: state.maintenanceMessage || 'Jedida Market is undergoing scheduled maintenance. Please check back soon.',
        maintenance: true,
      });
    }
  } catch (err) {
    console.error('Maintenance gate check failed (failing open):', err);
  }
  return next();
}

// Gates the partner self-service portal (API keys, webhooks, sandbox) —
// the one real third-party-facing API surface in this codebase today.
export async function partnerApiGate(req, res, next) {
  try {
    const state = await getLockdownState();
    if (state.partnerApisDisabled) {
      recordBlockedTraffic();
      return res.status(503).json({ error: 'Partner API access is temporarily disabled by the platform administrator.' });
    }
  } catch (err) {
    console.error('Partner API gate check failed (failing open):', err);
  }
  return next();
}

export async function paymentsGate(req, res, next) {
  try {
    const state = await getLockdownState();
    if (state.paymentsFrozen) {
      return res.status(503).json({ error: 'Payments are temporarily frozen platform-wide. Please try again shortly.' });
    }
  } catch (err) {
    console.error('Payments gate check failed (failing open):', err);
  }
  return next();
}

export async function withdrawalsGate(req, res, next) {
  try {
    const state = await getLockdownState();
    if (state.withdrawalsFrozen) {
      return res.status(503).json({ error: 'Withdrawals are temporarily frozen platform-wide. Please try again shortly.' });
    }
  } catch (err) {
    console.error('Withdrawals gate check failed (failing open):', err);
  }
  return next();
}
