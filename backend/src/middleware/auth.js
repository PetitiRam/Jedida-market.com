import { verifyAccessToken } from '../utils/jwt.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, isAdmin: payload.isAdmin, adminRole: payload.adminRole || null, mfaEnabled: Boolean(payload.mfaEnabled) };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or token invalid. Please sign in again.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!roles.includes(req.user.role) && !req.user.isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(header.split(' ')[1]);
    req.user = { id: payload.sub, role: payload.role, isAdmin: payload.isAdmin, adminRole: payload.adminRole || null, mfaEnabled: Boolean(payload.mfaEnabled) };
  } catch { /* not authenticated — proceed without req.user */ }
  next();
}
// Which admin sub-role can touch which functional area. An admin with no
// admin_role set (legacy accounts, or the account that bootstraps the
// platform) is treated as a super admin — nobody who already had access
// loses it because granular roles were introduced later.
export const ADMIN_ROLE_PERMISSIONS = {
  super_admin: ['*'],
  staff: ['orders', 'delivery', 'products'],
  moderator: ['products', 'shops', 'users'],
  support: ['chat', 'users'],
  finance: ['wallets', 'withdrawals', 'payments', 'orders', 'affiliates', 'disputes', 'ai_handler'],
  marketing: ['ads', 'campaigns', 'marketplace'],
  approvals: ['products', 'shops', 'upgrades', 'withdrawals', 'partners', 'affiliates', 'representatives', 'developer_platform'],
  ai_manager: ['ai', 'ai_handler'],
  chat_assistant: ['chat'],
  // Jedida Business Representative — handles manufacturer/supplier/seller/
  // dropshipper escalations from the AI assistant (see chat/aiAssistant.js),
  // and (Stage 4) is the account type behind market_representatives.
  business_rep: ['chat', 'partners', 'shops'],
  // Admin Security Agent — handles fraud/account-abuse/policy-violation
  // escalations, alongside PETITI's automated moderation. Stage 3 adds the
  // formal disputes/fraud-flags/security-log areas to this same role.
  security_agent: ['chat', 'users', 'products', 'disputes', 'fraud', 'security'],
};

// Every functional area a given admin sub-role's permissions cover.
// super_admin (and legacy admins with no admin_role set) covers everything.
export function roleAreas(role) {
  if (!role || role === 'super_admin') return ['*'];
  return ADMIN_ROLE_PERMISSIONS[role] || [];
}

// The literal "no administrator may create a role with permissions
// greater than their own" rule from the security brief, made checkable:
// true only if every area targetRole grants is also covered by
// actorRole. A '*'-scope actor (super admin) always passes; a '*'-scope
// target can only ever be granted by a '*'-scope actor. This is defense
// in depth — today the only two role-granting endpoints
// (assignAdminRole, createRepresentative) are already gated to super
// admins only at the route layer — but it means the rule holds even if
// a future route loosens that gate.
export function roleWithinGrantersScope(actorRole, targetRole) {
  const actorAreas = roleAreas(actorRole);
  if (actorAreas.includes('*')) return true;
  const targetAreas = roleAreas(targetRole);
  if (targetAreas.includes('*')) return false;
  return targetAreas.every((area) => actorAreas.includes(area));
}

// True for the accounts "Lower administrators must never see": super
// admins, and legacy full-admin accounts (is_admin true, admin_role
// NULL) which carry the same unrestricted access. Used to filter these
// rows out of any listing a non-super-admin can reach.
export function isSuperAdminAccount(user) {
  return Boolean(user?.is_admin) && (!user.admin_role || user.admin_role === 'super_admin');
}


// enabled (see authController.js's setupTwoFactor/verifyTwoFactor — those
// two endpoints are never gated by this, so an admin without 2FA yet
// always has a way in to turn it on rather than being locked out
// entirely). req.user.mfaEnabled is a snapshot taken when the access
// token was issued (see signAccessToken in utils/jwt.js), so it can lag
// up to one token lifetime (15m by default) behind a just-completed
// 2FA setup — the person's next login or token refresh picks it up.
export function requireMfaEnabled(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (!req.user.mfaEnabled) {
    return res.status(403).json({
      error: 'Two-factor authentication is required for this action. Enable it in Security settings, then sign in again.',
      mfaSetupRequired: true
    });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const isSuperAdmin = req.user.isAdmin && (!req.user.adminRole || req.user.adminRole === 'super_admin');
  if (!isSuperAdmin) {
    return res.status(403).json({ error: 'This action requires super admin access.' });
  }
  // Super admin is the highest privilege tier on the platform — enforce
  // 2FA at this single choke point rather than retrofitting every route
  // that calls requireSuperAdmin individually.
  return requireMfaEnabled(req, res, next);
}

// requirePermission('finance') etc. — gates a route to admins whose
// assigned sub-role covers that functional area (or a super admin/legacy
// admin, who can access everything).
export function requirePermission(area) {
  return (req, res, next) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    const role = req.user.adminRole;
    if (!role || role === 'super_admin') return next();
    const allowed = ADMIN_ROLE_PERMISSIONS[role] || [];
    if (allowed.includes('*') || allowed.includes(area)) return next();
    return res.status(403).json({ error: `Your admin role (${role}) does not have access to ${area}.` });
  };
}

// requireRole(...) lets any admin through, since most admin sub-roles are
// trusted to act on any business's behalf. A few actions must stay
// off-limits to a specific sub-role even so — a market representative
// (business_rep, phase44) must never create a supply contract or act as
// a party in a transaction; the DB already guarantees this for the
// representative-facing endpoints via chk_rep_cannot_touch_money, but
// business_rep is still a normal admin account, so requireRole's blanket
// admin bypass would otherwise let it through on routes that were never
// built with a representative in mind. Use
// denyAdminRole('business_rep') alongside requireRole(...)/requireAuth
// on those routes; it only ever removes access, never grants it.
export function denyAdminRole(...blockedAdminRoles) {
  return (req, res, next) => {
    if (req.user?.isAdmin && blockedAdminRoles.includes(req.user.adminRole)) {
      return res.status(403).json({ error: 'Representative accounts cannot perform this action — it must be done by the buyer or supplier directly.' });
    }
    next();
  };
}

// Gates every Partner Portal route: must be signed in as a user whose
// primary role is 'partner'. Whether that partnership is currently
// approved/active is a separate check (requireActivePartner in
// partnerPortalController.js), since a suspended partner should still be
// able to see *why*, rather than getting a bare 403 here.
export function requirePartner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  if (req.user.role !== 'partner') {
    return res.status(403).json({ error: 'This area is only available to approved partners.' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  try {
    // assumes authenticate middleware already attached req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    // adjust this depending on your user model
    const isAdmin =
      req.user.role === 'admin' ||
      req.user.isAdmin === true;

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Authorization check failed'
    });
  }
}
