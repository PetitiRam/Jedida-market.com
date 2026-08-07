// Two real, independent Google integrations, both no-op/throwing safely
// when their env vars aren't set:
//  1. Google OAuth "Sign in with Google" — verifies an ID token from the
//     web frontend's Google Identity Services button, or from the mobile
//     app's native Google Sign-In, against Google's public keys via
//     google-auth-library (the officially recommended verification path —
//     it validates signature, issuer, audience and expiry locally against
//     Google's cached public keys, unlike the deprecated/rate-limited
//     tokeninfo REST endpoint).
//  2. Google Custom Search (Images) — gives Colline a real image-sourcing
//     backend instead of the placeholder Unsplash URLs.

import { OAuth2Client } from 'google-auth-library';

// The web app, the Android app and the iOS app each register their own
// OAuth client ID in Google Cloud Console — that's expected and normal
// for "Sign in with Google", not a misconfiguration. A token minted for
// any one of them must be accepted by this single backend endpoint, so
// we verify against whichever of these are actually configured.
const WEB_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID || '';
const IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID || '';

const ACCEPTED_AUDIENCES = [WEB_CLIENT_ID, ANDROID_CLIENT_ID, IOS_CLIENT_ID].filter(Boolean);

// The client secret is never used here on purpose: verifying an ID token
// (the "one-tap" / native Sign-In flow this endpoint supports) only ever
// needs the client ID(s) as the expected audience. A client secret is
// only relevant for the server-side authorization-code exchange flow,
// which this integration does not use — so it is never read outside of
// documentation/env wiring, and never sent to or exposed in any frontend
// or mobile bundle.
const oauthClient = new OAuth2Client();

export function isGoogleAuthConfigured() {
  return ACCEPTED_AUDIENCES.length > 0;
}

export function isGoogleSearchConfigured() {
  return Boolean(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID);
}

/**
 * Verifies a Google Sign-In ID token (sent from the web frontend after
 * Google Identity Services returns a credential, or from the mobile app
 * after native Google Sign-In) and returns the verified profile, or throws.
 *
 * @param {string} idToken
 * @returns {Promise<{googleId: string, email: string, emailVerified: boolean, fullName: string, avatarUrl: string}>}
 */
export async function verifyGoogleIdToken(idToken) {
  if (!isGoogleAuthConfigured()) {
    throw new Error('Google Sign-In is not configured on this server.');
  }
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('A Google ID token is required.');
  }

  let ticket;
  try {
    ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: ACCEPTED_AUDIENCES
    });
  } catch (err) {
    throw new Error('Invalid or expired Google ID token.');
  }

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Invalid Google ID token.');
  }
  if (!payload.email_verified) {
    throw new Error('Google account email is not verified.');
  }
  if (!payload.email || !payload.sub) {
    throw new Error('Google token did not include the expected profile fields.');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    fullName: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture || null
  };
}

/**
 * Real image search for Colline's template generator. Falls back to the
 * caller's own placeholder logic when not configured (see collineBot.js).
 * @returns {Promise<string[]>} up to `count` image URLs
 */
export async function searchProductImages(query, count = 4) {
  if (!isGoogleSearchConfigured()) {
    throw new Error('GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_ENGINE_ID not configured.');
  }

  const params = new URLSearchParams({
    key: process.env.GOOGLE_SEARCH_API_KEY,
    cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
    q: query,
    searchType: 'image',
    num: String(Math.min(count, 10)),
    safe: 'active'
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Custom Search error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return (data.items || []).map((item) => item.link);
}
