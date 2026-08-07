// Single place that owns how a signed-in session is stored. Every login
// surface (SignIn, SignUp, GoogleSignInButton) calls persistLogin() instead
// of writing localStorage directly — that's what stops the "same three
// lines copy-pasted in three files" pattern from also having to be
// copy-pasted a fourth time for secure storage.
//
// Storage model:
//   - localStorage stays the synchronous source axios's interceptor reads
//     every request (secure storage is async, so it can't sit in that hot
//     path) — unchanged for the plain website.
//   - On a native shell, every write is *also* mirrored into platform
//     secure storage (Android Keystore / iOS Keychain, via
//     jedidaNativeBridge's setSecureItem), and rehydrate() copies it back
//     into localStorage on cold start. That's what makes "persistent
//     login" mean something more than "until the WebView clears its
//     storage" on native.
import { jedidaNative } from './jedidaNativeBridge';

const KEYS = {
  access: 'jedida_access_token',
  refresh: 'jedida_refresh_token',
  user: 'jedida_user',
  deviceId: 'jedida_device_id',
  biometricEnabled: 'jedida_biometric_enabled'
};

export async function persistLogin({ accessToken, refreshToken, user }) {
  localStorage.setItem(KEYS.access, accessToken);
  localStorage.setItem(KEYS.refresh, refreshToken);
  localStorage.setItem(KEYS.user, JSON.stringify(user));

  if (jedidaNative.isNative()) {
    await Promise.all([
      jedidaNative.setSecureItem(KEYS.access, accessToken),
      jedidaNative.setSecureItem(KEYS.refresh, refreshToken),
      jedidaNative.setSecureItem(KEYS.user, JSON.stringify(user))
    ]);
  }
}

export async function clearSession() {
  localStorage.removeItem(KEYS.access);
  localStorage.removeItem(KEYS.refresh);
  localStorage.removeItem(KEYS.user);

  if (jedidaNative.isNative()) {
    await Promise.all([
      jedidaNative.removeSecureItem(KEYS.access),
      jedidaNative.removeSecureItem(KEYS.refresh),
      jedidaNative.removeSecureItem(KEYS.user)
    ]);
  }
}

// Called once at app boot (native only). If the WebView's own localStorage
// was ever cleared (low-storage eviction, an OS "clear app cache") but the
// Keystore/Keychain copy survived, this restores it before the first API
// call goes out — otherwise the person would be silently signed out for a
// reason they can't see or fix.
export async function rehydrateFromSecureStorage() {
  if (!jedidaNative.isNative()) return;
  if (localStorage.getItem(KEYS.access)) return; // already have a live copy, nothing to do

  const [access, refresh, user] = await Promise.all([
    jedidaNative.getSecureItem(KEYS.access),
    jedidaNative.getSecureItem(KEYS.refresh),
    jedidaNative.getSecureItem(KEYS.user)
  ]);
  if (access) localStorage.setItem(KEYS.access, access);
  if (refresh) localStorage.setItem(KEYS.refresh, refresh);
  if (user) localStorage.setItem(KEYS.user, user);
}

export function hasStoredSession() {
  return !!localStorage.getItem(KEYS.access);
}

// A stable per-install identifier so the "trusted devices" list on the
// backend can show one row per physical device rather than one row per
// refresh-token rotation. Generated once and kept in secure storage; falls
// back to a per-browser-profile id on the web (less meaningful there, but
// harmless — the backend only uses it to label a session, never to trust
// anything security-relevant).
export async function getDeviceInfo() {
  const storageKey = KEYS.deviceId;
  let id = jedidaNative.isNative()
    ? await jedidaNative.getSecureItem(storageKey)
    : localStorage.getItem(storageKey);

  if (!id) {
    id = crypto.randomUUID();
    if (jedidaNative.isNative()) await jedidaNative.setSecureItem(storageKey, id);
    else localStorage.setItem(storageKey, id);
  }

  const platform = jedidaNative.platform();
  const name = platform === 'web' ? `${navigator.platform || 'Browser'}` : deviceLabel(platform);
  return { id, name, platform };
}

function deviceLabel(platform) {
  const ua = navigator.userAgent || '';
  if (platform === 'android') return /pixel|samsung|sm-/i.test(ua) ? 'Android phone' : 'Android device';
  if (platform === 'ios') return /ipad/i.test(ua) ? 'iPad' : 'iPhone';
  if (platform === 'desktop') return `Desktop (${jedidaNative.isDesktop() && window.jedidaDesktop?.platform === 'darwin' ? 'Mac' : window.jedidaDesktop?.platform === 'win32' ? 'Windows' : 'Linux'})`;
  return 'Browser';
}

// --- Biometric unlock opt-in (a preference, not a security boundary by
// itself — see BiometricGate.jsx for how it's enforced) ---
export function isBiometricEnabled() {
  return localStorage.getItem(KEYS.biometricEnabled) === 'true';
}
export function setBiometricEnabled(enabled) {
  localStorage.setItem(KEYS.biometricEnabled, enabled ? 'true' : 'false');
}
