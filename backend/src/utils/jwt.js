import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';

// Separate secret for MFA challenge tokens (falls back to the access
// secret if unset, for local/dev setups that haven't added the new env
// var yet). Deliberately not the refresh secret either — a challenge
// token proves only "this password was correct", never enough on its
// own to reach a protected route, and requireAuth() rejects anything
// without a normal access-token shape regardless.
const MFA_SECRET = process.env.JWT_MFA_SECRET || process.env.JWT_ACCESS_SECRET;

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.primary_role,
      isAdmin: user.is_admin,
      adminRole: user.admin_role || null,
      // Snapshot at sign-in time, same as role/isAdmin above — a change
      // takes effect on the next login or token refresh (both ≤15m by
      // default), not mid-token. Lets requireMfaEnabled() gate privileged
      // routes without a DB lookup on every request.
      mfaEnabled: Boolean(user.two_factor_enabled)
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m', algorithm: ALGORITHM }
  );
}

// Issued after a correct password when the account has 2FA enabled.
// Proves nothing beyond "the password was correct" — it cannot be used
// as a Bearer access token (requireAuth verifies against a different
// secret/shape) and is only ever accepted by POST /api/auth/2fa/login-verify.
export function signMfaChallengeToken(userId) {
  return jwt.sign(
    { sub: userId, purpose: 'mfa_challenge' },
    MFA_SECRET,
    { expiresIn: '5m', algorithm: ALGORITHM }
  );
}

export function verifyMfaChallengeToken(token) {
  const payload = jwt.verify(token, MFA_SECRET, { algorithms: [ALGORITHM] });
  if (payload.purpose !== 'mfa_challenge') {
    throw new Error('Invalid token purpose.');
  }
  return payload;
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', algorithm: ALGORITHM }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] });
}
