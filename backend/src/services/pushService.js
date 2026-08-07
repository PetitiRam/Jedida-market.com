// Mobile push notifications (chat messages, order/payment/delivery updates).
//
// Follows the same "real integration, deterministic no-op fallback" shape
// as llmClient.js: when FIREBASE_SERVICE_ACCOUNT isn't set, every
// call here just logs and returns — the platform works end-to-end without
// a Firebase project, and turning real push on later is a single env var,
// no code change.
//
// The client side (@capacitor/push-notifications, wired through
// jedidaNativeBridge.js) registers against Firebase Cloud Messaging on
// both Android and iOS (FCM proxies to APNs for iOS under the hood), so
// one server-side integration covers both platforms.

import { query } from '../config/db.js';

let firebaseApp = null;
let initAttempted = false;

export function isPushConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

// Lazy + defensive: firebase-admin is only require()'d if a service account
// is actually configured, so installs that never turn push on don't need
// the dependency to be usable (though it's listed in package.json).
async function getFirebaseApp() {
  if (firebaseApp || initAttempted) return firebaseApp;
  initAttempted = true;
  if (!isPushConfigured()) return null;

  try {
    const admin = await import('firebase-admin');
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    firebaseApp = admin.default.initializeApp({
      credential: admin.default.credential.cert(serviceAccount)
    });
    return firebaseApp;
  } catch (err) {
    console.error('pushService: failed to initialize firebase-admin (push disabled):', err.message);
    return null;
  }
}

export async function registerDeviceToken({ userId, token, platform }) {
  if (!userId || !token || !platform) throw new Error('userId, token, and platform are required');
  const result = await query(
    `
    INSERT INTO device_push_tokens (user_id, token, platform)
    VALUES ($1, $2, $3)
    ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3, last_seen_at = now()
    RETURNING id, user_id, platform, created_at
    `,
    [userId, token, platform]
  );
  return result.rows[0];
}

export async function unregisterDeviceToken({ userId, token }) {
  await query('DELETE FROM device_push_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
}

async function getTokensForUser(userId) {
  const result = await query('SELECT token FROM device_push_tokens WHERE user_id = $1', [userId]);
  return result.rows.map((r) => r.token);
}

async function chatPushEnabled(userId) {
  const result = await query('SELECT chat_push_enabled FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.chat_push_enabled !== false;
}

// Removes tokens FCM reports as dead (app uninstalled, token rotated) so
// the table doesn't accumulate stale devices.
async function pruneInvalidTokens(tokens, responses) {
  const dead = [];
  responses.forEach((r, i) => {
    const code = r.error?.code || '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
      dead.push(tokens[i]);
    }
  });
  if (dead.length) {
    await query('DELETE FROM device_push_tokens WHERE token = ANY($1)', [dead]);
  }
}

/**
 * Sends a push notification to every device a user has registered.
 * `data` should be plain string key/values (FCM requirement) — used by the
 * client to deep-link (e.g. { type: 'chat', conversationId }).
 * Never throws — a push failure should never break the caller's main flow
 * (message send, order update, etc.).
 */
export async function sendPushToUser(userId, { title, body, data = {} }) {
  try {
    if (!(await chatPushEnabled(userId))) return { sent: 0, reason: 'disabled' };

    const app = await getFirebaseApp();
    const tokens = await getTokensForUser(userId);
    if (!tokens.length) return { sent: 0, reason: 'no_devices' };

    if (!app) {
      // Deterministic fallback: no Firebase project configured yet. Log so
      // this is visible/testable in dev without needing real credentials.
      console.log(`[pushService:noop] would notify user ${userId} (${tokens.length} device(s)): ${title} — ${body}`);
      return { sent: 0, reason: 'not_configured' };
    }

    const admin = await import('firebase-admin');
    const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

    const response = await admin.default.messaging(app).sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } }
    });

    await pruneInvalidTokens(tokens, response.responses);
    return { sent: response.successCount, failed: response.failureCount };
  } catch (err) {
    console.error('sendPushToUser error (non-fatal):', err.message);
    return { sent: 0, reason: 'error' };
  }
}
