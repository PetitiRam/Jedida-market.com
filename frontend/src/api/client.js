import axios from 'axios';
import { jedidaNative } from '../native/jedidaNativeBridge';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Requests hanging forever on a bad connection is worse than failing fast —
// callers can still catch a timeout and show a retry affordance.
const DEFAULT_TIMEOUT_MS = 15000;

const client = axios.create({ baseURL: API_BASE, timeout: DEFAULT_TIMEOUT_MS });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('jedida_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function isRetryableError(error) {
  // Never auto-retry a request that already reached the server and mutated
  // state (POST/PATCH/PUT/DELETE) unless the caller explicitly opts in via
  // `config.idempotent = true` — retrying those blind risks duplicate orders,
  // duplicate payments, etc. GETs are always safe to retry.
  const method = (error.config?.method || 'get').toLowerCase();
  const isSafeMethod = method === 'get' || error.config?.idempotent === true;
  if (!isSafeMethod) return false;

  if (error.code === 'ECONNABORTED' || error.message === 'Network Error') return true;
  const status = error.response?.status;
  return status === 502 || status === 503 || status === 504;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// auto-refresh on 401 once, retry transient network/timeout/5xx errors with backoff
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (!original) return Promise.reject(normalizeError(error));

    if (error.response?.status === 401 && !original._authRetry) {
      original._authRetry = true;
      const refreshToken = localStorage.getItem('jedida_refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          localStorage.setItem('jedida_access_token', data.accessToken);
          if (jedidaNative.isNative()) jedidaNative.setSecureItem('jedida_access_token', data.accessToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return client(original);
        } catch {
          localStorage.removeItem('jedida_access_token');
          localStorage.removeItem('jedida_refresh_token');
          if (jedidaNative.isNative()) {
            jedidaNative.removeSecureItem('jedida_access_token');
            jedidaNative.removeSecureItem('jedida_refresh_token');
          }
          window.dispatchEvent(new CustomEvent('jedida:session-expired'));
          return Promise.reject(normalizeError(error));
        }
      }
    }

    if (isRetryableError(error)) {
      original._retryCount = (original._retryCount || 0) + 1;
      if (original._retryCount <= MAX_RETRIES) {
        await delay(RETRY_BASE_DELAY_MS * 2 ** (original._retryCount - 1));
        return client(original);
      }
    }

    return Promise.reject(normalizeError(error));
  }
);

// Every screen currently has to re-derive "what happened" from raw axios
// errors. This gives callers one consistent shape to branch on.
export function normalizeError(error) {
  if (error?.isNormalized) return error;
  const status = error.response?.status ?? null;
  let kind = 'unknown';
  if (error.code === 'ECONNABORTED') kind = 'timeout';
  else if (error.message === 'Network Error' || !error.response) kind = 'offline';
  else if (status === 401 || status === 403) kind = 'auth';
  else if (status === 404) kind = 'not_found';
  else if (status === 409) kind = 'conflict';
  else if (status === 422 || status === 400) kind = 'validation';
  else if (status >= 500) kind = 'server';

  const serverMessage = error.response?.data?.error || error.response?.data?.message;
  const friendlyMessage = {
    timeout: "That took too long. Check your connection and try again.",
    offline: "You appear to be offline. Check your connection and try again.",
    auth: "Your session has expired. Please sign in again.",
    not_found: "We couldn't find what you were looking for.",
    conflict: serverMessage || "This was already processed — no need to retry.",
    validation: serverMessage || "Please check the details and try again.",
    server: "Something went wrong on our end. Please try again shortly.",
    unknown: serverMessage || "Something went wrong. Please try again.",
  }[kind];

  const endpoint = error.config ? `${(error.config.method || 'get').toUpperCase()} ${error.config.url}` : 'unknown endpoint';
  // Always log which specific call failed and what the backend actually
  // said — without this, a failing API surfaces only as a generic
  // full-page "Something went wrong" with zero way to tell which of the
  // several calls a page makes (home feed, auth/me, products, ...) was
  // the one that broke, or why.
  console.error(`[API] ${endpoint} failed (${status ?? kind}):`, serverMessage || error.message);

  const normalized = Object.assign(error, {
    isNormalized: true,
    kind,
    status,
    endpoint,
    friendlyMessage,
  });
  return normalized;
}

// Called when the app returns to the foreground (see SessionGuard.jsx) so
// a token that expired while backgrounded is renewed before the person's
// next tap 401s. Silently does nothing without a stored session; a real
// failure still goes through the same session-expired signal as the
// reactive path above, via the next request that 401s naturally.
export async function proactiveRefresh() {
  const refreshToken = localStorage.getItem('jedida_refresh_token');
  if (!refreshToken) return;
  try {
    const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
    localStorage.setItem('jedida_access_token', data.accessToken);
    if (jedidaNative.isNative()) jedidaNative.setSecureItem('jedida_access_token', data.accessToken);
  } catch {
    // Leave it to the next real request's 401 handling — avoids logging
    // someone out just because one background refresh attempt failed on a
    // flaky connection.
  }
}

export default client;
