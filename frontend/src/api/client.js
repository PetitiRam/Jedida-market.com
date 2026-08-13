import axios from 'axios';
import { jedidaNative } from '../native/jedidaNativeBridge';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Requests hanging forever on a bad connection is worse than failing fast —
// callers can still catch a timeout and show a retry affordance.
const DEFAULT_TIMEOUT_MS = 15000;

// Media uploads (logos, product photos/video, KYC documents, selfies,
// partner documents, payment proofs...) are not ordinary API calls: the
// browser has to push the actual file bytes up the wire, then the server
// has to run it through validation, push it to Cloudinary, and write the
// DB row, before any response comes back. On a real mobile connection —
// not a dev machine on wifi — that routinely takes well past 15s once you
// add a few MB of video. Applying the same 15s ceiling used for a
// lightweight JSON call meant every upload that took slightly too long
// timed out with no server response at all, which every uploader in the
// app then reported as an opaque "Upload failed" with no explanation.
// This is deliberately generous — a slow upload finishing late is fine;
// a fast one being killed early is the actual bug.
const UPLOAD_TIMEOUT_MS = 120000;

const client = axios.create({ baseURL: API_BASE, timeout: DEFAULT_TIMEOUT_MS });

// Global connectivity signal — a single, app-wide "are we online" state
// that OfflineScreen (via useNetworkStatus) listens for, so a lost
// connection is detected no matter which page or component made the
// request that discovered it. Two custom events, dispatched only from
// here (the one place every request already passes through):
//
//   'jedida:network-offline' — a request just failed with a genuine
//   network error (kind 'offline' in normalizeError: no response came
//   back at all — covers both "device has no connectivity" and
//   "internet is fine but our backend can't be reached").
//
//   'jedida:network-online' — a request just completed successfully.
//   Fired on every success, not just after a prior failure, so recovery
//   is detected the moment ANY call gets through again — no polling
//   required. useNetworkStatus() treats this as idempotent (setting
//   "online" when already online is a no-op).
//
// File uploads are deliberately excluded (see uploadFormData below): a
// slow/failed upload is surfaced inline by the uploader itself and
// should never trigger a jarring full-screen takeover mid-upload.
function notifyNetworkOnline() {
  window.dispatchEvent(new CustomEvent('jedida:network-online'));
}
function notifyNetworkOffline(endpoint) {
  window.dispatchEvent(new CustomEvent('jedida:network-offline', { detail: { endpoint } }));
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('jedida_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Any request that completes successfully is proof the network — and our
// backend — is reachable right now, regardless of what else may have
// failed recently. Kept separate from the retry/refresh logic below so it
// runs unconditionally on the success path.
client.interceptors.response.use((res) => {
  notifyNetworkOnline();
  return res;
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

  // Genuine network failures drive the global offline screen (see
  // useNetworkStatus.js) — but only for ordinary API calls. File uploads
  // opt out via `skipOfflineScreen` (set by uploadFormData below): a
  // failed/timed-out upload is already surfaced inline by the uploader
  // itself, and category 3/400/401/404 validation & auth errors never
  // reach here as kind 'offline' in the first place, so this can't
  // accidentally swallow those.
  if (kind === 'offline' && !error.config?.skipOfflineScreen) {
    notifyNetworkOffline(endpoint);
  }

  const normalized = Object.assign(error, {
    isNormalized: true,
    kind,
    status,
    endpoint,
    friendlyMessage,
  });
  return normalized;
}

// The one function every file-upload call site in the app should use.
// Two things every one of them needs to get right, that several didn't:
//
// 1. Never set `Content-Type` on a FormData body. A multipart request
//    needs a `boundary=...` parameter in that header, and only the
//    browser can generate it (it's a random value tied to how it chose
//    to split the body). Passing `'multipart/form-data'` explicitly
//    overrides the header the browser would have set with one that has
//    no boundary at all, which breaks the server's multipart parser —
//    most visibly on larger files, where the malformed body reliably
//    fails instead of occasionally limping through on a small one.
//    This function intentionally accepts no `headers` override for that
//    reason — there is no correct value to pass here.
// 2. Use a timeout long enough for an actual file to finish uploading
//    (see UPLOAD_TIMEOUT_MS above), not the short default meant for
//    JSON calls — and scale it further for large files (see
//    timeoutForFileSize below), since a fixed ceiling that's generous
//    for a 2MB photo can still be too tight for a 45MB product video.
//
// `onUploadProgress` is passed straight through to axios so callers can
// render a real progress bar instead of an indefinite spinner.
// `signal` accepts an AbortController signal so callers can offer a
// Cancel button on long video/audio uploads instead of forcing someone
// to wait out a full timeout to back out.
export function uploadFormData(url, formData, { onUploadProgress, timeout, signal } = {}) {
  return client.post(url, formData, {
    timeout: timeout || UPLOAD_TIMEOUT_MS,
    onUploadProgress,
    signal,
    // A failed or slow upload (timeout, dropped connection mid-transfer,
    // Cloudinary hiccup) is surfaced inline by the uploader's own error
    // state — see MediaUploader.jsx's Cancel/Retry UI — never by the
    // full-screen global offline takeover. If the device is genuinely
    // offline, the browser's native online/offline events (also wired
    // into useNetworkStatus) will still show the global screen; this
    // flag only stops THIS request's failure from being the trigger.
    skipOfflineScreen: true,
    // Uploads must never be silently auto-retried by the response
    // interceptor — retrying a multipart POST blind risks creating a
    // duplicate file/record server-side. `idempotent` defaults to
    // undefined (falsy), so this is just documenting that we deliberately
    // don't opt in, not changing behavior.
  });
}

// Scales the upload timeout to the actual file size instead of using one
// fixed number for everything. A tiny image and a 45MB product video
// don't deserve the same ceiling — this assumes a conservative ~300KB/s
// sustained upload speed (well below average mobile speeds, so it's a
// floor, not a target) plus a flat allowance for compression, server-side
// validation, and the Cloudinary round-trip, and never goes below the
// UPLOAD_TIMEOUT_MS baseline or above 6 minutes.
export function timeoutForFileSize(bytes) {
  const BASELINE_MS = UPLOAD_TIMEOUT_MS; // 120s — covers small files entirely
  const ASSUMED_BYTES_PER_SEC = 300 * 1024;
  const PROCESSING_OVERHEAD_MS = 20000;
  const MAX_MS = 360000; // 6 minutes
  const estimate = Math.round((bytes / ASSUMED_BYTES_PER_SEC) * 1000) + PROCESSING_OVERHEAD_MS;
  return Math.min(MAX_MS, Math.max(BASELINE_MS, estimate));
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
