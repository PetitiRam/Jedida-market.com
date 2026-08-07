// Origin verification for state-changing requests — defense-in-depth
// alongside the CORS allowlist above it in server.js.
//
// This API authenticates purely with an `Authorization: Bearer` header
// that client-side JS must read out of storage and attach explicitly —
// unlike a cookie, a browser never attaches it automatically to a
// cross-site request. That's what makes classic CSRF (a malicious page
// silently replaying a victim's ambient credentials) not apply to this
// architecture the way it does to cookie-authenticated apps: there's no
// credential for a forged cross-site request to ride along on.
//
// This middleware exists anyway, for the cases that reasoning doesn't
// cover: a future cookie-based flow, a compromised browser extension that
// can forge headers but not read cross-origin state, or a misconfigured
// CORS proxy. It rejects state-changing browser requests (POST/PUT/PATCH/
// DELETE) whose Origin doesn't match an allowed origin. Non-browser
// callers (mobile app, server-to-server webhooks, curl) never send an
// Origin header and are left untouched, same as the CORS check.
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function verifyRequestOrigin(allowedOrigins) {
  return (req, res, next) => {
    if (!STATE_CHANGING_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next(); // not a browser fetch/XHR — nothing to verify
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return next();
    return res.status(403).json({ error: 'Request origin not allowed.' });
  };
}
