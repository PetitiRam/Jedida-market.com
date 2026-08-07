// Mirrors the web app's localStorage keys/behavior (see
// frontend/src/utils/auth.js) but backed by Expo SecureStore, which
// encrypts values at rest (Keychain on iOS, Keystore-backed EncryptedSharedPreferences
// on Android) — appropriate for JWT access/refresh tokens, unlike
// AsyncStorage which stores plaintext.

import * as SecureStore from 'expo-secure-store';

const KEYS = {
  accessToken: 'jedida_access_token',
  refreshToken: 'jedida_refresh_token',
  user: 'jedida_user'
};

export async function saveSession({ accessToken, refreshToken, user }) {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, accessToken),
    SecureStore.setItemAsync(KEYS.refreshToken, refreshToken),
    SecureStore.setItemAsync(KEYS.user, JSON.stringify(user))
  ]);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(KEYS.accessToken);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(KEYS.refreshToken);
}

export async function getUser() {
  const raw = await SecureStore.getItemAsync(KEYS.user);
  return raw ? JSON.parse(raw) : null;
}

export async function isAuthenticated() {
  return Boolean(await getAccessToken());
}

export async function setAccessToken(accessToken) {
  await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.accessToken),
    SecureStore.deleteItemAsync(KEYS.refreshToken),
    SecureStore.deleteItemAsync(KEYS.user)
  ]);
}
