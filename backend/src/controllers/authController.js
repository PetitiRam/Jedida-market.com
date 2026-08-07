import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import cryptoRandomString from 'crypto-random-string';
import { query } from '../config/db.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, signMfaChallengeToken, verifyMfaChallengeToken } from '../utils/jwt.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import { getAuthPolicy } from '../services/authPolicyService.js';
import { getLockdownState } from '../services/platformLockdownService.js';
import { verifyGoogleIdToken, isGoogleAuthConfigured } from '../services/googleClient.js';
import { recordReferralOnRegister } from '../services/affiliateService.js';
import { lookupIpGeo } from '../services/geoIpService.js';
import { isCommonPassword } from '../constants/commonPasswords.js';
import { checkPasswordLeaked } from '../services/passwordLeakCheckService.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeUsername = (username) => String(username || '').trim().toLowerCase();

// Every login/register/google-auth flow issues a refresh token the same
// way; this is the one place that decides what "a session" looks like in
// the database, including the optional device metadata the native shell
// sends (web callers omit `device` and just get an unnamed session, same
// as before this existed).
async function insertSession(userId, refreshToken, device) {
  const policy = await getAuthPolicy();
  // "One active session per account" — configurable platform-wide via
  // auth_security_policy (PETITI/admin-tunable, same as every other knob
  // here). When on, a fresh sign-in revokes every other still-valid
  // session for this account before creating the new one, so at most one
  // refresh token is ever live at a time.
  if (policy.single_session_enforced) {
    await query(`UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`, [userId]);
  }
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_id, device_name, platform, last_used_at)
     VALUES ($1, $2, now() + interval '7 days', $3, $4, $5, now())`,
    [userId, hashToken(refreshToken), device?.id || null, device?.name || null, device?.platform || null]
  );
}

// ===== Password history — prevent reuse of a user's last N passwords =====
// N is `password_history_limit` on auth_security_policy (default 5,
// 0 disables the check). bcrypt hashes are salted, so reuse can only be
// detected by comparing the candidate password against each stored hash,
// not by comparing hashes directly.
async function assertPasswordNotReused({ userId, newPassword, currentPasswordHash, limit }) {
  if (!limit || limit <= 0) return;
  const historyResult = await query(
    'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, Math.max(limit - 1, 0)]
  );
  const hashesToCheck = [currentPasswordHash, ...historyResult.rows.map((r) => r.password_hash)].filter(Boolean);
  for (const hash of hashesToCheck) {
    if (await bcrypt.compare(newPassword, hash)) {
      const err = new Error('PASSWORD_REUSED');
      err.code = 'PASSWORD_REUSED';
      throw err;
    }
  }
}

// Call right after a password change succeeds, passing the hash that was
// JUST replaced (not the new one — the new one becomes "history" the next
// time it's changed). Trims the table back down to `limit` rows so it
// never grows unbounded for an account that changes its password often.
async function recordPasswordHistory(userId, replacedPasswordHash, limit) {
  if (!replacedPasswordHash) return;
  await query('INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)', [userId, replacedPasswordHash]);
  await query(
    `DELETE FROM password_history WHERE id IN (
       SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC OFFSET $2
     )`,
    [userId, Math.max(Number(limit) || 0, 0)]
  );
}

const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8u8q8u8q8u8q8u8q8u8q8u8q8u8q8u';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;

import { recordFailedLogin } from '../services/securityEventService.js';

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

async function logLoginAttempt(identifier, req, success) {
  const ip = clientIp(req);
  // Geolocation is only worth the lookup (and the cost) on a login that
  // actually succeeded — that's the only kind scanImpossibleTravel in
  // petitiSecurityEngine.js ever compares. lookupIpGeo never throws and
  // resolves quickly to null on any failure, so this can't slow down or
  // break a login attempt.
  const geo = success ? await lookupIpGeo(ip) : null;
  await query(
    `INSERT INTO login_attempts (email, ip_address, success, user_agent, country, city, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [identifier, ip, success, req.headers['user-agent'] || null,
      geo?.country || null, geo?.city || null, geo?.lat ?? null, geo?.lng ?? null]
  );
  // Fire-and-forget: counts recent failures from this IP and auto-blocks
  // past the brute-force threshold. Never awaited — must not slow down or
  // fail the login response it's describing.
  if (!success) recordFailedLogin(ip, identifier).catch(() => {});
}

const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

// Now async — the leaked-password check requires a network round trip.
// All three call sites (registerStep2, resetPassword, changePassword)
// already `await` this.
async function validatePassword(password, policy) {
  // 12 is an absolute floor regardless of what an admin has the
  // configurable `min_password_length` set to — that knob can raise the
  // bar above 12 but can no longer lower it beneath the security
  // brief's minimum.
  const minLen = Math.max(policy?.min_password_length || 8, 12);
  if (!password || password.length < minLen) {
    return `Password must be at least ${minLen} characters.`;
  }
  if (password.length > 128) {
    return 'Password is too long.';
  }
  if (!PASSWORD_COMPLEXITY.test(password)) {
    return 'Password must include an uppercase letter, a lowercase letter, a number, and a special character.';
  }
  if (isCommonPassword(password)) {
    return 'That password is too common. Please choose something less predictable.';
  }
  const leakResult = await checkPasswordLeaked(password);
  if (leakResult.leaked) {
    return 'That password has appeared in a known data breach. Please choose a different one.';
  }
  return null;
}

// Mirrors the backfill logic from schema_phase19.sql: derive a
// USERNAME_REGEX-compliant handle from the email local-part, then
// disambiguate against existing rows so a Google sign-up never collides
// with an existing username.
async function generateUniqueUsernameFromEmail(email) {
  const base = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 30);
  const padded = base.length >= 3 ? base : `${base}${cryptoRandomString({ length: 3 - base.length, type: 'alphanumeric' }).toLowerCase()}`;

  let candidate = padded;
  let suffix = 1;
  // Extremely unlikely to loop more than once or twice in practice.
  while (true) {
    const existing = await query('SELECT id FROM users WHERE username = $1', [candidate]);
    if (existing.rows.length === 0) return candidate;
    suffix += 1;
    const suffixStr = `_${suffix}`;
    candidate = `${padded.slice(0, 30 - suffixStr.length)}${suffixStr}`;
  }
}

export async function registerStep1(req, res) {
  const { fullName, email, phoneNumber, referralCode } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (!email || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!phoneNumber || !PHONE_REGEX.test(phoneNumber.trim())) {
    return res.status(400).json({ error: 'Phone number must include a country code, e.g. +256700000000.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = phoneNumber.trim();

  try {
    const existingEmail = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }
    const existingPhone = await query('SELECT id FROM users WHERE phone_number = $1', [normalizedPhone]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this phone number already exists.' });
    }

    await query(`UPDATE pending_registrations SET used = TRUE WHERE email = $1 AND used = FALSE`, [normalizedEmail]);

    const rawToken = cryptoRandomString({ length: 48, type: 'url-safe' });
    const tokenHash = hashToken(rawToken);

    await query(
      `INSERT INTO pending_registrations (full_name, email, phone_number, token_hash, expires_at, referral_code_used, signup_ip)
       VALUES ($1, $2, $3, $4, now() + interval '15 minutes', $5, $6)`,
      [fullName.trim(), normalizedEmail, normalizedPhone, tokenHash,
        referralCode ? String(referralCode).trim().toUpperCase() : null, clientIp(req)]
    );

    return res.status(201).json({
      status: 'step_1_complete',
      message: 'Basic details verified. Continue to set your username and password.',
      registrationToken: rawToken,
      expiresInMinutes: 15
    });
  } catch (err) {
    console.error('Register step 1 error:', err);
    return res.status(500).json({ error: 'Could not process registration. Please try again.' });
  }
}

export async function registerStep2(req, res) {
  const { registrationToken, username, password } = req.body;

  if (!registrationToken) {
    return res.status(400).json({ error: 'Registration token is required. Please restart registration.' });
  }
  if (!username || !USERNAME_REGEX.test(normalizeUsername(username))) {
    return res.status(400).json({ error: 'Username must be 3-30 characters: lowercase letters, numbers, dots, or underscores only.' });
  }

  const policy = await getAuthPolicy();
  const passwordError = await validatePassword(password, policy);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const normalizedUsername = normalizeUsername(username);
  const tokenHash = hashToken(registrationToken);

  try {
    const pendingResult = await query(
      `SELECT * FROM pending_registrations WHERE token_hash = $1 AND used = FALSE AND expires_at > now()`,
      [tokenHash]
    );
    const pending = pendingResult.rows[0];
    if (!pending) {
      return res.status(400).json({ error: 'This registration session has expired or is invalid. Please start over.' });
    }

    const existingUsername = await query('SELECT id FROM users WHERE username = $1', [normalizedUsername]);
    if (existingUsername.rows.length > 0) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    const existingEmail = await query('SELECT id FROM users WHERE email = $1', [pending.email]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }
    const existingPhone = await query('SELECT id FROM users WHERE phone_number = $1', [pending.phone_number]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this phone number already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await query(
      `INSERT INTO users (full_name, email, phone_number, username, password_hash, is_verified)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, email, username, full_name, phone_number, primary_role, is_admin, status, kyc_status, is_verified, created_at`,
      [pending.full_name, pending.email, pending.phone_number, normalizedUsername, passwordHash]
    );
    const user = userResult.rows[0];

    await query('UPDATE pending_registrations SET used = TRUE WHERE id = $1', [pending.id]);

    if (pending.referral_code_used) {
      // Never blocks or fails registration — the service catches its own errors.
      await recordReferralOnRegister({
        referralCode: pending.referral_code_used,
        newUser: user,
        signupIp: pending.signup_ip,
        device: req.body.device
      });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await insertSession(user.id, refreshToken, req.body.device);

    return res.status(201).json({
      status: 'registration_complete',
      message: 'Account created successfully.',
      user, accessToken, refreshToken
    });
  } catch (err) {
    console.error('Register step 2 error:', err);
    return res.status(500).json({ error: 'Could not complete registration. Please try again.' });
  }
}

export async function login(req, res) {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username and password are all required.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);
  const genericError = { error: 'Invalid credentials.' };
  const loginIdentifier = `${normalizedEmail}|${normalizedUsername}`;

  try {
    const policy = await getAuthPolicy();

    const ipAttempts = await query(
      `SELECT COUNT(*) FROM login_attempts
       WHERE ip_address = $1 AND success = FALSE AND created_at > now() - interval '5 minutes'`,
      [clientIp(req)]
    );
    if (Number(ipAttempts.rows[0].count) >= 20) {
      return res.status(429).json({ error: 'Too many failed attempts from this network. Please try again later.' });
    }

    const result = await query(
      `SELECT id, email, username, password_hash, full_name, phone_number, primary_role, is_admin, admin_role, status,
              kyc_status, is_verified, locked_until, failed_login_count, two_factor_enabled, must_change_password
       FROM users WHERE email = $1`,
      [normalizedEmail]
    );
    const user = result.rows[0];

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      await logLoginAttempt(loginIdentifier, req, false);
      return res.status(401).json(genericError);
    }

    if (normalizeUsername(user.username) !== normalizedUsername) {
      await bcrypt.compare(password, DUMMY_HASH);
      await logLoginAttempt(loginIdentifier, req, false);
      return res.status(401).json(genericError);
    }

    // Emergency "Disable Login" control — blocks everyone except super
    // admins, so whoever flipped it on can always sign back in to flip it
    // off again. Checked here (not as generic middleware) because it needs
    // to know the account's role before deciding.
    const isSuperAdminAccount = user.is_admin && (!user.admin_role || user.admin_role === 'super_admin');
    if (!isSuperAdminAccount) {
      const lockdown = await getLockdownState();
      if (lockdown.loginDisabled) {
        return res.status(503).json({ error: 'Login is temporarily disabled by the platform administrator. Please try again shortly.' });
      }
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({ error: `Too many failed attempts. Try again in ${minutesLeft} minute(s).` });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      await logLoginAttempt(loginIdentifier, req, false);
      const newCount = (user.failed_login_count || 0) + 1;

      if (newCount >= policy.max_failed_logins) {
        await query(
          `UPDATE users SET failed_login_count = 0, locked_until = now() + ($1 || ' minutes')::interval WHERE id = $2`,
          [policy.lockout_minutes, user.id]
        );
        return res.status(423).json({ error: `Too many failed attempts. Your account is locked for ${policy.lockout_minutes} minutes.` });
      }

      await query('UPDATE users SET failed_login_count = $1 WHERE id = $2', [newCount, user.id]);
      return res.status(401).json(genericError);
    }

    if (user.status === 'suspended') {
      await logLoginAttempt(loginIdentifier, req, false);
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });
    }
    if (user.status === 'rejected') {
      await logLoginAttempt(loginIdentifier, req, false);
      return res.status(403).json({ error: 'This account is not active. Contact support.' });
    }
    if (!user.is_verified) {
      await logLoginAttempt(loginIdentifier, req, false);
      return res.status(403).json({ error: 'This account has not completed registration.' });
    }

    await query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [user.id]);

    // A forced reset (set by petitiResponseEngine.requirePasswordReset after
    // suspicious activity, or manually by an admin) blocks sign-in entirely
    // until the person goes through "Forgot password" — that requires
    // proving email access, which is a stronger bar than the old password
    // alone if the account was actually compromised. Checked before the
    // 2FA branch below so a forced-reset account never even reaches that
    // second factor with stale credentials.
    if (user.must_change_password) {
      await logLoginAttempt(loginIdentifier, req, false);
      return res.status(403).json({
        error: 'For your security, you need to reset your password before signing in. Use "Forgot password" to set a new one.',
        mustChangePassword: true
      });
    }

    // Password was correct, but that's only the first factor on an
    // account with 2FA enabled — don't log this as a completed login or
    // issue any tokens yet. The person proves the second factor at
    // POST /api/auth/2fa/login-verify, which does the logging/token
    // issuance this function would otherwise do below.
    if (user.two_factor_enabled) {
      const mfaToken = signMfaChallengeToken(user.id);
      return res.json({ mfaRequired: true, mfaToken });
    }

    await logLoginAttempt(loginIdentifier, req, true);

    delete user.password_hash;
    delete user.locked_until;
    delete user.failed_login_count;
    delete user.two_factor_enabled;
    delete user.must_change_password;

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await insertSession(user.id, refreshToken, req.body.device);

    return res.json({ message: 'Signed in successfully.', user, accessToken, refreshToken });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
}

// Sign in (or sign up, or link) with Google. Accepts the ID token minted
// by Google Identity Services (web) or native Google Sign-In (mobile),
// verifies it server-side, and issues the exact same JWT access/refresh
// token pair as the password login/registration flows above — so
// everything downstream (requireAuth middleware, refresh, logout,
// logout-all) works identically regardless of how the session started.
export async function googleAuth(req, res) {
  const { idToken } = req.body;

  if (!isGoogleAuthConfigured()) {
    return res.status(503).json({ error: 'Sign in with Google is not available right now.' });
  }
  if (!idToken) {
    return res.status(400).json({ error: 'A Google ID token is required.' });
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Could not verify your Google account.' });
  }

  const normalizedEmail = normalizeEmail(profile.email);

  try {
    // 1) Already linked — this is a returning Google user.
    let result = await query(
      `SELECT id, email, username, full_name, phone_number, primary_role, is_admin, admin_role,
              status, kyc_status, is_verified, avatar_url, google_id
       FROM users WHERE google_id = $1`,
      [profile.googleId]
    );
    let user = result.rows[0];
    let isNewAccount = false;

    if (!user) {
      // 2) Not linked yet — look up by email. If an account with this
      //    email already exists (password-based or otherwise), link the
      //    Google identity to it instead of creating a duplicate account.
      result = await query(
        `SELECT id, email, username, full_name, phone_number, primary_role, is_admin, admin_role,
                status, kyc_status, is_verified, avatar_url, google_id
         FROM users WHERE email = $1`,
        [normalizedEmail]
      );
      user = result.rows[0];

      if (user) {
        if (user.google_id && user.google_id !== profile.googleId) {
          // Extremely unlikely (would mean this email is already linked to
          // a *different* Google account) — refuse rather than silently
          // reassigning ownership of the account.
          return res.status(409).json({ error: 'This email is already linked to a different Google account.' });
        }
        const updateResult = await query(
          `UPDATE users
              SET google_id = $1,
                  avatar_url = COALESCE(avatar_url, $2),
                  is_verified = TRUE
            WHERE id = $3
            RETURNING id, email, username, full_name, phone_number, primary_role, is_admin, admin_role,
                      status, kyc_status, is_verified, avatar_url, google_id`,
          [profile.googleId, profile.avatarUrl, user.id]
        );
        user = updateResult.rows[0];
      } else {
        // 3) No existing account at all — create a new one. No password;
        //    phone number can be completed later (see phase 20 migration).
        const username = await generateUniqueUsernameFromEmail(normalizedEmail);
        const insertResult = await query(
          `INSERT INTO users (full_name, email, username, google_id, avatar_url, is_verified, phone_verification_required)
           VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
           RETURNING id, email, username, full_name, phone_number, primary_role, is_admin, admin_role,
                     status, kyc_status, is_verified, avatar_url, google_id`,
          [profile.fullName, normalizedEmail, username, profile.googleId, profile.avatarUrl]
        );
        user = insertResult.rows[0];
        isNewAccount = true;

        if (req.body.referralCode) {
          await recordReferralOnRegister({
            referralCode: req.body.referralCode,
            newUser: user,
            signupIp: clientIp(req),
            device: req.body.device
          });
        }
      }
    }

    if (user.status === 'suspended') {
      await logLoginAttempt(normalizedEmail, req, false);
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });
    }
    if (user.status === 'rejected') {
      await logLoginAttempt(normalizedEmail, req, false);
      return res.status(403).json({ error: 'This account is not active. Contact support.' });
    }

    await logLoginAttempt(normalizedEmail, req, true);

    delete user.google_id;

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await insertSession(user.id, refreshToken, req.body.device);

    return res.status(isNewAccount ? 201 : 200).json({
      message: isNewAccount ? 'Account created with Google.' : 'Signed in with Google.',
      isNewAccount,
      user, accessToken, refreshToken
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(500).json({ error: 'Could not sign in with Google. Please try again.' });
  }
}

export async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required.' });

  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const stored = await query(
      `SELECT id, last_used_at FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND revoked = FALSE AND expires_at > now()`,
      [payload.sub, tokenHash]
    );
    if (stored.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token is invalid or expired. Please sign in again.' });
    }

    // Automatic session expiration on inactivity — separate from the 7-day
    // absolute expiry above. A session that's simply gone unused for
    // longer than idle_session_timeout_minutes (PETITI/admin-tunable) is
    // revoked here rather than left to silently expire at the 7-day mark.
    const policy = await getAuthPolicy();
    const idleLimitMs = (policy.idle_session_timeout_minutes || 20160) * 60000;
    const lastUsedAt = stored.rows[0].last_used_at ? new Date(stored.rows[0].last_used_at).getTime() : null;
    if (lastUsedAt && Date.now() - lastUsedAt > idleLimitMs) {
      await query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [stored.rows[0].id]);
      return res.status(401).json({ error: 'Your session expired due to inactivity. Please sign in again.' });
    }

    await query(`UPDATE refresh_tokens SET last_used_at = now() WHERE id = $1`, [stored.rows[0].id]);

    const userResult = await query(
      `SELECT id, primary_role, is_admin, admin_role, status, two_factor_enabled FROM users WHERE id = $1`,
      [payload.sub]
    );
    const user = userResult.rows[0];
    if (!user || user.status === 'suspended' || user.status === 'rejected') {
      return res.status(401).json({ error: 'Account not found or inactive. Please sign in again.' });
    }

    const accessToken = signAccessToken(user);
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Refresh token is invalid or expired. Please sign in again.' });
  }
}

export async function logout(req, res) {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await query(`UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, [hashToken(refreshToken)]);
  }
  return res.json({ message: 'Signed out.' });
}

export async function logoutAllSessions(req, res) {
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [req.user.id]);
  return res.json({ message: 'Signed out of all devices.' });
}

// GET /api/auth/sessions — trusted-device list. `refreshToken` in the body
// is optional and only used to mark which row is "this device" in the
// response; omitting it (e.g. a plain fetch from a settings page that
// doesn't want to touch the stored token) just skips that flag.
export async function listSessions(req, res) {
  const currentHash = req.body?.refreshToken ? hashToken(req.body.refreshToken) : null;
  const result = await query(
    `SELECT id, device_name, platform, created_at, last_used_at, token_hash
     FROM refresh_tokens
     WHERE user_id = $1 AND revoked = FALSE AND expires_at > now()
     ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
    [req.user.id]
  );
  const sessions = result.rows.map(({ token_hash, ...row }) => ({
    ...row,
    isCurrent: currentHash ? token_hash === currentHash : false
  }));
  return res.json({ sessions });
}

// DELETE /api/auth/sessions/:id — revoke exactly one device/session
// without touching the user's other logins (logout-all remains the
// separate "sign out everywhere" action for a suspected compromise).
export async function revokeSession(req, res) {
  const result = await query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  return res.json({ message: 'That device has been signed out.' });
}

export async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const normalizedEmail = normalizeEmail(email);
  const genericResponse = { message: 'If an account exists for that email, a reset link has been sent.' };

  try {
    const result = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rows.length === 0) return res.json(genericResponse);

    const user = result.rows[0];
    const rawToken = cryptoRandomString({ length: 48, type: 'url-safe' });

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '15 minutes')`,
      [user.id, hashToken(rawToken)]
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}&uid=${user.id}`;
    await sendPasswordResetEmail(normalizedEmail, resetLink);

    return res.json(genericResponse);
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Could not process request. Please try again.' });
  }
}

export async function resetPassword(req, res) {
  const { uid, token, newPassword } = req.body;
  if (!uid || !token || !newPassword) {
    return res.status(400).json({ error: 'Missing reset details.' });
  }

  const policy = await getAuthPolicy();
  const passwordError = await validatePassword(newPassword, policy);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const tokenHash = hashToken(token);
    const result = await query(
      `SELECT id FROM password_reset_tokens
       WHERE user_id = $1 AND token_hash = $2 AND used = FALSE AND expires_at > now()`,
      [uid, tokenHash]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const currentResult = await query('SELECT password_hash FROM users WHERE id = $1', [uid]);
    const currentPasswordHash = currentResult.rows[0]?.password_hash;

    try {
      await assertPasswordNotReused({ userId: uid, newPassword, currentPasswordHash, limit: policy.password_history_limit });
    } catch (err) {
      if (err.code === 'PASSWORD_REUSED') {
        return res.status(400).json({ error: `Choose a password you haven't used recently (last ${policy.password_history_limit}).` });
      }
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query(
      `UPDATE users SET password_hash = $1, failed_login_count = 0, locked_until = NULL,
              must_change_password = FALSE, must_change_password_reason = NULL
       WHERE id = $2`,
      [passwordHash, uid]
    );
    await recordPasswordHistory(uid, currentPasswordHash, policy.password_history_limit);
    await query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [result.rows[0].id]);
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [uid]);

    return res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Could not reset password. Please try again.' });
  }
}

export async function getMe(req, res) {
  try {
    const result = await query(
      `SELECT id, email, username, full_name, phone_number, is_verified, location_country, location_city,
              primary_role, is_admin, admin_role, status, kyc_status, avatar_url, preferred_language, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Could not load profile.' });
  }
}

export async function updateMyLanguage(req, res) {
  try {
    const { language } = req.body;
    const allowed = ['en', 'fr', 'sw', 'lg', 'xog'];
    if (!allowed.includes(language)) {
      return res.status(400).json({ error: 'Unsupported language.' });
    }
    const result = await query(
      'UPDATE users SET preferred_language = $1 WHERE id = $2 RETURNING id, preferred_language',
      [language, req.user.id]
    );
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update language error:', err);
    return res.status(500).json({ error: 'Could not update language.' });
  }
}

// Called silently by the frontend the moment the browser's Geolocation API
// resolves — never a manual "set your location" form. Powers the
// automatic "products near you" ranking on the marketplace and lets a
// seller's shop inherit real coordinates the instant it's created.
// POST /api/auth/change-password — authenticated password change (distinct
// from the forgot/reset flow, which is for a signed-out person). Revokes
// every other session on success, same as a reset, since the old password
// could have been compromised.
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  try {
    const policy = await getAuthPolicy();
    const passwordError = await validatePassword(newPassword, policy);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    try {
      await assertPasswordNotReused({
        userId: req.user.id, newPassword,
        currentPasswordHash: result.rows[0].password_hash, limit: policy.password_history_limit
      });
    } catch (err) {
      if (err.code === 'PASSWORD_REUSED') {
        return res.status(400).json({ error: `Choose a password you haven't used recently (last ${policy.password_history_limit}).` });
      }
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, must_change_password_reason = NULL WHERE id = $2',
      [passwordHash, req.user.id]
    );
    await recordPasswordHistory(req.user.id, result.rows[0].password_hash, policy.password_history_limit);
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [req.user.id]);
    return res.json({ message: 'Password changed. Please sign in again on your other devices.' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Could not change password.' });
  }
}

// GET /api/auth/login-history — this account's recent login attempts
// (success and failure), matched against the `email|username` identifier
// logLoginAttempt writes at sign-in time.
export async function getLoginHistory(req, res) {
  try {
    const userResult = await query('SELECT email, username FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const { email } = userResult.rows[0];
    const result = await query(
      `SELECT success, ip_address, user_agent, created_at FROM login_attempts
       WHERE email LIKE $1 ORDER BY created_at DESC LIMIT 50`,
      [`${normalizeEmail(email)}|%`]
    );
    return res.json({ history: result.rows });
  } catch (err) {
    console.error('Login history error:', err);
    return res.status(500).json({ error: 'Could not load login history.' });
  }
}

// ===== Two-factor authentication (TOTP) =====
// Generic to every role — a base32 secret plus a standard otpauth:// URL
// the frontend renders as a QR code. Nothing is enabled until the person
// proves they can generate a valid code (verifyTwoFactor), so a partially
// set-up secret can never lock someone out.
function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) output += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return output;
}
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totpAt(secretBuffer, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}
function verifyTotp(secretBase32, token) {
  if (!token || !/^\d{6}$/.test(token)) return false;
  const secretBuffer = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 30000);
  // Accept the current window and one step either side for clock drift.
  for (const drift of [-1, 0, 1]) {
    if (totpAt(secretBuffer, counter + drift) === token) return true;
  }
  return false;
}

// POST /api/auth/2fa/setup — generates (but does not yet enable) a secret.
export async function setupTwoFactor(req, res) {
  try {
    const secret = base32Encode(crypto.randomBytes(20));
    await query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [secret, req.user.id]);
    const userResult = await query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const label = encodeURIComponent(`JEDIDA Marketplace:${userResult.rows[0]?.email || req.user.id}`);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=JEDIDA%20Marketplace&digits=6&period=30`;
    return res.json({ secret, otpauthUrl });
  } catch (err) {
    console.error('2FA setup error:', err);
    return res.status(500).json({ error: 'Could not start two-factor setup.' });
  }
}

// POST /api/auth/2fa/verify — proves the person's authenticator app is
// correctly configured, then turns 2FA on and issues one-time backup codes.
export async function verifyTwoFactor(req, res) {
  const { code } = req.body;
  try {
    const result = await query('SELECT two_factor_secret FROM users WHERE id = $1', [req.user.id]);
    const secret = result.rows[0]?.two_factor_secret;
    if (!secret) return res.status(400).json({ error: 'Start two-factor setup first.' });
    if (!verifyTotp(secret, code)) return res.status(400).json({ error: 'That code is incorrect or has expired.' });

    const backupCodes = Array.from({ length: 8 }, () => cryptoRandomString({ length: 10, type: 'alphanumeric' }).toUpperCase());
    await query(
      'UPDATE users SET two_factor_enabled = TRUE, two_factor_backup_codes = $1 WHERE id = $2',
      [backupCodes, req.user.id]
    );
    return res.json({ message: 'Two-factor authentication is now enabled.', backupCodes });
  } catch (err) {
    console.error('2FA verify error:', err);
    return res.status(500).json({ error: 'Could not verify two-factor code.' });
  }
}

// POST /api/auth/2fa/disable — requires the current password, same bar as
// changing it, since disabling 2FA weakens the account.
export async function disableTwoFactor(req, res) {
  const { currentPassword } = req.body;
  try {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const valid = await bcrypt.compare(currentPassword || '', result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    await query(
      'UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, two_factor_backup_codes = NULL WHERE id = $1',
      [req.user.id]
    );
    return res.json({ message: 'Two-factor authentication has been disabled.' });
  } catch (err) {
    console.error('2FA disable error:', err);
    return res.status(500).json({ error: 'Could not disable two-factor authentication.' });
  }
}

// POST /api/auth/2fa/login-verify — the second step of login() for any
// account with 2FA enabled. Takes the short-lived mfaToken issued by
// login() plus either a 6-digit TOTP code or a one-time backup code, and
// on success issues the exact same access/refresh token pair login()
// would have issued directly. Rate-limited tightly at the route layer
// (mfaLoginLimiter in routes/auth.js) on top of the per-account lockout
// below, since a 6-digit code is only ~1e6 possibilities.
export async function verifyLoginTwoFactor(req, res) {
  const { mfaToken, code, backupCode, device } = req.body;
  const genericError = { error: 'That code is incorrect or has expired.' };

  let challenge;
  try {
    challenge = verifyMfaChallengeToken(mfaToken);
  } catch {
    return res.status(401).json({ error: 'Your sign-in session expired. Please sign in again.' });
  }

  try {
    const policy = await getAuthPolicy();
    const result = await query(
      `SELECT id, email, username, full_name, phone_number, primary_role, is_admin, admin_role, status,
              kyc_status, is_verified, locked_until, two_factor_failed_count, two_factor_enabled, two_factor_secret, two_factor_backup_codes
       FROM users WHERE id = $1`,
      [challenge.sub]
    );
    const user = result.rows[0];
    if (!user || !user.two_factor_enabled) {
      return res.status(401).json({ error: 'Your sign-in session expired. Please sign in again.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({ error: `Too many failed attempts. Try again in ${minutesLeft} minute(s).` });
    }

    const loginIdentifier = `${normalizeEmail(user.email)}|${normalizeUsername(user.username)}`;
    let usedBackupCode = false;

    if (backupCode) {
      const codes = user.two_factor_backup_codes || [];
      const match = codes.find((c) => c.toUpperCase() === String(backupCode).trim().toUpperCase());
      if (!match) {
        await logLoginAttempt(loginIdentifier, req, false);
        return res.status(401).json(genericError);
      }
      usedBackupCode = true;
      const remaining = codes.filter((c) => c !== match);
      await query('UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2', [remaining, user.id]);
    } else if (!verifyTotp(user.two_factor_secret, code)) {
      await logLoginAttempt(loginIdentifier, req, false);
      const newCount = (user.two_factor_failed_count || 0) + 1;

      if (newCount >= policy.max_failed_logins) {
        await query(
          `UPDATE users SET two_factor_failed_count = 0, locked_until = now() + ($1 || ' minutes')::interval WHERE id = $2`,
          [policy.lockout_minutes, user.id]
        );
        return res.status(423).json({ error: `Too many failed attempts. Your account is locked for ${policy.lockout_minutes} minutes.` });
      }

      await query('UPDATE users SET two_factor_failed_count = $1 WHERE id = $2', [newCount, user.id]);
      return res.status(401).json(genericError);
    }

    await query('UPDATE users SET two_factor_failed_count = 0, locked_until = NULL WHERE id = $1', [user.id]);
    await logLoginAttempt(loginIdentifier, req, true);

    const backupCodesRemaining = user.two_factor_backup_codes?.length ?? 0;
    delete user.locked_until;
    delete user.two_factor_failed_count;
    delete user.two_factor_secret;
    delete user.two_factor_backup_codes;

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    await insertSession(user.id, refreshToken, device);

    const response = { message: 'Signed in successfully.', user, accessToken, refreshToken };
    if (usedBackupCode) {
      response.warning = `Backup code used — ${backupCodesRemaining} remaining. Consider regenerating your backup codes from Security settings.`;
    }
    return res.json(response);
  } catch (err) {
    console.error('2FA login-verify error:', err);
    return res.status(500).json({ error: 'Could not verify two-factor code.' });
  }
}

export async function updateMyLocation(req, res) {
  try {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }
    const result = await query(
      'UPDATE users SET location_lat = $1, location_lng = $2 WHERE id = $3 RETURNING id, location_lat, location_lng',
      [latNum, lngNum, req.user.id]
    );
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update location error:', err);
    return res.status(500).json({ error: 'Could not update location.' });
  }
}
