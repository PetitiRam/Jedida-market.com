import * as petiti from './petitiService.js';
import * as security from './petitiSecurityEngine.js';
import * as marketplace from './petitiMarketplaceEngine.js';
import * as monitoring from './petitiMonitoringEngine.js';
import * as response from './petitiResponseEngine.js';

export async function getDashboard(req, res) {
  try {
    const [health, snapshot, openAlerts] = await Promise.all([
      monitoring.runHealthCheck(),
      marketplace.marketplaceSnapshot(),
      petiti.listAlerts({ status: 'open' })
    ]);
    res.json({ health, snapshot, openAlerts, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('PETITI dashboard error:', err);
    res.status(500).json({ error: 'PETITI could not assemble the dashboard.' });
  }
}

export async function getLogs(req, res) {
  const { level, limit } = req.query;
  const logs = await petiti.listLogs({ actor: 'petiti', level, limit });
  res.json({ logs });
}

export async function getAlerts(req, res) {
  const { status, severity } = req.query;
  const alerts = await petiti.listAlerts({ status, severity });
  res.json({ alerts });
}

export async function postResolveAlert(req, res) {
  const alert = await petiti.resolveAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  res.json({ message: 'Alert resolved.', alert });
}

export async function postDismissAlert(req, res) {
  const alert = await petiti.dismissAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });
  res.json({ message: 'Alert dismissed as a false positive.', alert });
}

export async function getActions(req, res) {
  const actions = await petiti.listActions({ status: req.query.status });
  res.json({ actions });
}

export async function postApproveAction(req, res) {
  const action = await petiti.executeApprovedAction(req.params.id, req.user.id);
  if (!action) return res.status(404).json({ error: 'Action not found or already handled.' });
  res.json({ message: 'Action approved and executed.', action });
}

export async function getSecurityOverview(req, res) {
  const reports = await security.listFraudReports({});
  res.json({ reports });
}

export async function postRunSecurityScan(req, res) {
  const summary = await security.runFullScan();
  res.json({ message: 'Security scan complete.', summary });
}

export async function getFailedLogins(req, res) {
  const failedLogins = await security.listRecentFailedLogins(req.query.limit);
  res.json({ failedLogins });
}

export async function getActiveSessions(req, res) {
  const sessions = await security.listActiveSessions(req.query.limit);
  res.json({ sessions });
}

export async function getRiskScore(req, res) {
  const score = await security.computeRiskScore(req.params.userId);
  res.json(score);
}

export async function getMarketplaceIntelligence(req, res) {
  const snapshot = await marketplace.marketplaceSnapshot();
  res.json({ snapshot });
}

export async function getRecommendations(req, res) {
  const recommendations = await marketplace.generateRecommendations();
  res.json({ recommendations });
}

export async function getHealthHistory(req, res) {
  const history = await monitoring.recentHealth();
  res.json({ history });
}

// ===== Site-editing surface =====
export async function putLogo(req, res) {
  await petiti.updateLogo(req.body.logoUrl);
  res.json({ message: 'Logo updated by PETITI.' });
}
export async function putTheme(req, res) {
  const settings = await petiti.updateTheme(req.body);
  res.json({ message: 'Theme updated by PETITI.', settings });
}
export async function putCustomCss(req, res) {
  await petiti.updateCustomCss(req.body.css || '');
  res.json({ message: 'Custom CSS updated by PETITI.' });
}
export async function getPages(req, res) {
  const pages = await petiti.listPages();
  res.json({ pages });
}
export async function postPage(req, res) {
  const page = await petiti.createOrUpdatePage(req.body);
  res.status(201).json({ message: 'Page published by PETITI.', page });
}
export async function deletePageHandler(req, res) {
  await petiti.deletePage(req.params.id);
  res.json({ message: 'Page removed.' });
}
export async function postProposeCodeChange(req, res) {
  const action = await petiti.proposeCodeChange(req.body);
  res.status(201).json({ message: 'Code change proposed for human review.', action });
}

// "Let PETITI upgrade auth when prompted" — bounded to the tunable policy
// knobs (lockout thresholds, OTP expiry, password rules, token TTLs), never
// to source code. See upgradeAuthPolicy in petitiService.js for the boundary.
export async function getAuthPolicyHandler(req, res) {
  const policy = await petiti.getAuthSecurityPolicy();
  res.json({ policy });
}

export async function postUpgradeAuthPolicy(req, res) {
  const { patch, reasoning } = req.body;
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({ error: 'A patch object of policy fields to change is required.' });
  }
  const policy = await petiti.upgradeAuthPolicy(patch, reasoning || 'Requested by admin via AI Command Center.');
  res.json({ message: 'PETITI updated the authentication security policy.', policy });
}

// ===== Threat Response Engine (Section 2/3/4/8 of the security spec) =====
// See petitiResponseEngine.js for the containment logic and the audit
// trail these actions write to (ai_actions + platform_security_log).

// Manual trigger — lets an admin ask PETITI to assess+contain a specific
// account on demand, using the same tiering the automated scans use.
export async function postRespondToThreat(req, res) {
  const { category, riskScore, subjectUserId, ip, details, evidence } = req.body;
  if (!category || riskScore === undefined || !details) {
    return res.status(400).json({ error: 'category, riskScore, and details are required.' });
  }
  const result = await response.respondToThreat({ category, riskScore, subjectUserId, ip, details, evidence });
  res.json({ message: `Threat contained at ${result.tier} tier.`, ...result });
}

// Admin-only reversal — liftSecurityState/unblockIp both require an admin
// id, enforced here by requireAdmin already applied at the router level
// and by passing req.user.id through explicitly.
export async function postLiftSecurityState(req, res) {
  await response.liftSecurityState(req.params.userId, req.user.id);
  res.json({ message: 'Security hold lifted.' });
}

// Admin-triggered version of the same forced-reset PETITI applies
// automatically at medium/high threat tiers — for cases a human admin
// spots that the automated scans didn't (a support ticket, a tip-off,
// etc). req.user.id is passed through as triggeredBy so the audit trail
// shows an admin action, not "petiti".
export async function postRequirePasswordReset(req, res) {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason is required.' });
  await response.requirePasswordReset(req.params.userId, reason, req.user.id);
  res.json({ message: 'That account must reset its password before signing in again.' });
}

export async function postBlockIp(req, res) {
  const { ip, reason } = req.body;
  if (!ip || !reason) return res.status(400).json({ error: 'ip and reason are required.' });
  await response.blockIp(ip, reason, req.user.id);
  res.json({ message: `${ip} blocked.` });
}

export async function postUnblockIp(req, res) {
  await response.unblockIp(req.params.ip, req.user.id);
  res.json({ message: `${req.params.ip} unblocked.` });
}

export async function postEnterEmergencyMode(req, res) {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'A reason is required to enter emergency mode.' });
  await response.enterEmergencyMode(reason, `admin:${req.user.id}`);
  res.json({ message: 'Emergency mode activated.' });
}

// requireSuperAdmin is applied at the route level — this is the one
// action in the whole PETITI surface that a regular admin sub-role can't
// take, matching "Only authorized administrators can disable emergency
// mode" in the spec.
export async function postExitEmergencyMode(req, res) {
  await response.exitEmergencyMode(req.user.id);
  res.json({ message: 'Emergency mode deactivated.' });
}

export async function getEmergencyModeStatus(req, res) {
  const status = await response.getEmergencyModeStatus();
  res.json({ status });
}

// ===== Security Command Centre (spec section 7) =====
export async function getSecurityHolds(req, res) {
  const holds = await response.listSecurityHolds({ state: req.query.state });
  res.json({ holds });
}

export async function getBlockedIps(req, res) {
  const ips = await response.listBlockedIps();
  res.json({ ips });
}

export async function getSecurityCommandCenter(req, res) {
  const summary = await response.getSecurityCommandCenterSummary();
  res.json({ summary });
}

// ===== Self-learning (spec section 6) — admin feedback on past fraud
// reports becomes the training signal petitiLearningEngine.js reads back
// to adjust future risk scores. See that file for how the adjustment
// itself is computed.
export async function postReviewFraudReport(req, res) {
  const { outcome } = req.body;
  if (!outcome) return res.status(400).json({ error: 'outcome ("confirmed" or "dismissed") is required.' });
  try {
    const report = await security.reviewFraudReport(req.params.id, outcome, req.user.id);
    if (!report) return res.status(404).json({ error: 'Fraud report not found.' });
    res.json({ message: `Report marked ${outcome}.`, report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getLearningStats(req, res) {
  const categories = await security.getAllCategoryAccuracy();
  res.json({ categories });
}
