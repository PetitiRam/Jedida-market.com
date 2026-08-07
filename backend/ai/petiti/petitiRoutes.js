import express from 'express';
import * as ctrl from './petitiController.js';
import { requireAuth, requireAdmin, requirePermission, requireSuperAdmin } from '../../src/middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireAdmin, requirePermission('ai'));

router.get('/dashboard', ctrl.getDashboard);

router.get('/logs', ctrl.getLogs);

router.get('/alerts', ctrl.getAlerts);
router.post('/alerts/:id/resolve', ctrl.postResolveAlert);
router.post('/alerts/:id/dismiss', ctrl.postDismissAlert);

router.get('/actions', ctrl.getActions);
router.post('/actions/:id/approve', ctrl.postApproveAction);

router.get('/security', ctrl.getSecurityOverview);
router.post('/security/scan', ctrl.postRunSecurityScan);
router.get('/security/risk/:userId', ctrl.getRiskScore);

router.get('/marketplace', ctrl.getMarketplaceIntelligence);
router.get('/recommendations', ctrl.getRecommendations);

router.get('/health', ctrl.getHealthHistory);

// site-editing surface
router.put('/site/logo', ctrl.putLogo);
router.put('/site/theme', ctrl.putTheme);
router.put('/site/css', ctrl.putCustomCss);
router.get('/site/pages', ctrl.getPages);
router.post('/site/pages', ctrl.postPage);
router.delete('/site/pages/:id', ctrl.deletePageHandler);
router.post('/site/propose-code-change', ctrl.postProposeCodeChange);

// bounded auth-policy tuning ("upgrade auth when prompted")
router.get('/security/auth-policy', ctrl.getAuthPolicyHandler);
router.post('/security/auth-policy/upgrade', ctrl.postUpgradeAuthPolicy);

// autonomous threat response — containment, access guardian, emergency mode
router.post('/security/respond', ctrl.postRespondToThreat);
router.post('/security/state/:userId/lift', ctrl.postLiftSecurityState);
router.post('/security/state/:userId/require-password-reset', ctrl.postRequirePasswordReset);
router.post('/security/ip/block', ctrl.postBlockIp);
router.post('/security/ip/:ip/unblock', ctrl.postUnblockIp);
router.get('/security/emergency-mode', ctrl.getEmergencyModeStatus);
router.post('/security/emergency-mode/enter', ctrl.postEnterEmergencyMode);
// Exiting emergency mode is the one action on this router that a
// non-super admin (e.g. a security_agent) cannot take on their own —
// matches "Only authorized administrators can disable emergency mode."
router.post('/security/emergency-mode/exit', requireSuperAdmin, ctrl.postExitEmergencyMode);

// Security Command Centre — dashboard reads
router.get('/security/command-center', ctrl.getSecurityCommandCenter);
router.get('/security/holds', ctrl.getSecurityHolds);
router.get('/security/ip', ctrl.getBlockedIps);
router.get('/security/failed-logins', ctrl.getFailedLogins);
router.get('/security/active-sessions', ctrl.getActiveSessions);

// Self-learning — admin feedback on fraud reports feeds future risk scoring
router.post('/security/reports/:id/review', ctrl.postReviewFraudReport);
router.get('/security/learning', ctrl.getLearningStats);

export default router;
