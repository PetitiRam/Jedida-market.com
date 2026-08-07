// Wires the native push-notification bridge (jedidaNativeBridge.js) into
// the marketplace's actual chat + auth flow. On the regular website this
// entire module is inert — every call it makes bottoms out in a
// jedidaNative no-op — so it's safe to import and run unconditionally from
// App.jsx.
//
// Flow:
//   1. registerForPush()  — call once, after the user is signed in (App.jsx
//      does this in a top-level effect). Requests OS permission, gets an
//      FCM token from the shell, and POSTs it to /api/push/register.
//   2. Tapping a notification while the app is backgrounded/closed fires
//      onPushTapped -> we dispatch the same OPEN_CHAT_EVENT the header's
//      Messages menu uses, carrying the conversationId so FloatingChatButton
//      opens straight into that conversation instead of the default one.
//   3. unregisterForPush() — call from logout() so a signed-out device
//      stops receiving another account's notifications.

import client from '../api/client';
import { jedidaNative } from './jedidaNativeBridge';
import { OPEN_CHAT_EVENT } from '../components/header/MessagesMenu';

const TOKEN_STORAGE_KEY = 'jedida_push_token';

let listenersAttached = false;

function currentPlatform() {
  const p = jedidaNative.platform();
  return p === 'ios' || p === 'android' ? p : 'web';
}

async function sendTokenToServer(token) {
  if (!token) return;
  try {
    await client.post('/push/register', { token, platform: currentPlatform() });
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch (err) {
    console.error('Failed to register push token:', err.message);
  }
}

function attachRuntimeListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  // Notification tapped (app was backgrounded/closed) — deep-link into the
  // conversation it's about.
  jedidaNative.onPushTapped((data) => {
    if (data?.type === 'chat' && data.conversationId) {
      window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { conversationId: data.conversationId } }));
    }
  });

  // Notification arrives while the app is already open — no system banner
  // in that case, so bump the header's unread indicator the same way a
  // live socket message would (MessagesMenu already listens for this).
  jedidaNative.onPushReceived(() => {
    window.dispatchEvent(new Event('jedida:unread-bump'));
  });
}

// Call once per app session after sign-in confirms. Safe to call multiple
// times (e.g. StrictMode double-invoke, or re-called after token refresh)
// — jedidaNative.registerPush is itself idempotent on the native side.
export async function registerForPush() {
  if (!jedidaNative.isNative()) return; // no native push transport on plain web yet
  attachRuntimeListeners();
  await jedidaNative.registerPush((token) => sendTokenToServer(token));
}

// Call from logout() before the access token is cleared, so the request
// is still authenticated.
export async function unregisterForPush() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return;
  try {
    await client.delete('/push/register', { data: { token } });
  } catch (err) {
    console.error('Failed to unregister push token:', err.message);
  } finally {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}
