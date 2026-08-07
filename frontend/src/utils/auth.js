import client from '../api/client';
import { clearSession } from '../native/authSession';
import { unregisterForPush } from '../native/pushNotifications';

export function getUser(){
  const user = localStorage.getItem("jedida_user");

  if(!user) return null;

  return JSON.parse(user);
}


export function isAuthenticated(){
  return !!localStorage.getItem(
    "jedida_access_token"
  );
}


export function logout(){
  const refreshToken = localStorage.getItem('jedida_refresh_token');

  // Best-effort server-side revoke — this device's refresh token stops
  // working immediately instead of just sitting unused until it expires.
  // Never blocks the local sign-out on a slow/offline network.
  if (refreshToken) {
    client.post('/auth/logout', { refreshToken }).catch(() => {});
  }

  unregisterForPush().finally(() => {
    clearSession().finally(() => {
      window.location.href = "/";
    });
  });
}
