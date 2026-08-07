# Mobile Google Sign-In — setup

No React Native / Expo app directory was present in the uploaded project,
so these are new files meant to be copied into your existing Expo app at
the same relative paths (`src/services/...`), plus the two config
additions below. Nothing here replaces existing screens or auth logic —
`GoogleSignInSection.example.js` is a copy-paste snippet for wiring the
button into your existing Sign In / Sign Up screens.

## 1. Packages

```
npx expo install expo-auth-session expo-web-browser expo-secure-store expo-constants
```

## 2. app.config.js (or app.json) — expose the client IDs to the app

```js
export default {
  expo: {
    // ...existing config
    extra: {
      // ...existing extra values
      googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
      googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
      googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
    },
    scheme: 'jedidamarketplace', // needed for the auth redirect in standalone builds
  },
};
```

## 3. Environment variables (`.env`, read by app.config.js at build time)

```
GOOGLE_WEB_CLIENT_ID=          # same value as the backend's GOOGLE_CLIENT_ID
GOOGLE_IOS_CLIENT_ID=          # optional — only for standalone iOS builds
GOOGLE_ANDROID_CLIENT_ID=      # optional — only for standalone Android builds
EXPO_PUBLIC_API_URL=https://api.jedidamarketplace.com/api
```

`GOOGLE_WEB_CLIENT_ID` is required even for the Android/iOS builds — it's
what Expo Go's auth proxy uses, and what the backend actually checks the
token's audience against by default. Configure `GOOGLE_ANDROID_CLIENT_ID`
/ `GOOGLE_IOS_CLIENT_ID` (and the matching backend env vars
`GOOGLE_ANDROID_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID`) only when you build a
standalone app outside Expo Go and want native-feeling platform-specific
client IDs.

## 4. Google Cloud Console

For each client ID above, add the redirect URI Expo prints when you run
`npx expo start` (for Expo Go) or your app's custom scheme URI (for
standalone builds) to that OAuth client's "Authorized redirect URIs".

## 5. Using it

See `src/services/googleAuth.js` (the `useGoogleSignIn` hook) and
`src/screens/GoogleSignInSection.example.js` (a copy-paste usage example
for an existing screen). The hook posts the Google ID token to the same
`POST /auth/google` endpoint the web app uses, then stores the returned
JWT pair via `src/services/secureStorage.js` (Expo SecureStore) — from
that point on, `src/services/api.js`'s axios instance behaves exactly
like the web app's client (auto-attaches the access token, retries once
through `/auth/refresh` on a 401).
