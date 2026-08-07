# JEDIDA Marketplace — Shell Applications

## Architecture

The shell does **not** rebuild the frontend. Each platform's shell is a thin
native wrapper that loads `https://jedidamarketplace.com` directly and stays
on it — every UI/product/marketplace/seller/buyer update you deploy to the
web app appears in the shell instantly, with no app-store release. Only
changes to *this* shell code (a new native plugin, a security rule, an icon)
require publishing a new app version.

| Platform | Technology | Why |
|---|---|---|
| Android / iOS | **Capacitor** | Loads the live site in a native WebView via `server.url`; Capacitor's JS bridge (`window.Capacitor`) is automatically present on the page, so the existing frontend can call native plugins without any native rebuild. |
| Windows / macOS / Linux | **Electron** | Same idea — a `BrowserWindow` pointed at the production URL, with a `preload.js` bridge (`window.jedidaDesktop`) exposing notifications, clipboard, and file save. |

This repo does **not** touch `frontend/` business logic, routing, or the
backend API — the only frontend change is the download page
(`frontend-patch/src/pages/DownloadApp.jsx`) and one optional adapter file
(`frontend-patch/src/native/jedidaNativeBridge.js`) that the current
components can call to *optionally* light up native camera/share/biometrics
when running inside a shell. Nothing changes for regular web visitors.

## What's in this package

```
mobile-shell/      Capacitor project (Android + iOS)
  capacitor.config.ts        Production URL, navigation allowlist, splash/push config
  android-config/            Manifest, network security config, MainActivity additions
  ios-config/                Info.plist, entitlements, AppDelegate additions
  www/offline.html           Branded offline fallback page

desktop-shell/     Electron project (Windows/macOS/Linux)
  main.js / preload.js       Window, security, deep links, auto-update, notifications
  splash.html / offline.html Branded startup/offline screens

frontend-patch/    Files to copy into the EXISTING frontend
  index.html                          Adds manifest/icon links + service worker registration
  public/manifest.webmanifest         Makes the site installable (real, works today)
  public/sw.js                        Minimal service worker (required for installability + offline fallback)
  public/offline.html, icon-*.png     Branded offline page + generated app icons (192/512/maskable/apple-touch)
  src/components/InstallAppButton.jsx Real "Install app" button using the browser's own install API
  src/pages/DownloadApp.jsx           Download page: install button + native-binary cards driven by a live manifest
  src/native/jedidaNativeBridge.js    Optional native-capability adapter

backend-patch/     Two files to copy into the EXISTING backend
  src/routes/downloads.js             Serves the real installer files with force-download
                                      headers (Content-Disposition + correct MIME per platform)
  src/server.additions.js             Two lines wiring that route into server.js

ci/.github/workflows/build-shell.yml  GitHub Actions pipeline: builds the real signed
                                      .apk/.exe/.dmg/.AppImage on every version tag and
                                      deploys them into backend/public/downloads/
```

## What's downloadable right now vs. what needs a CI run

**Works today, verified, no build pipeline needed:** the "Install JEDIDA
Marketplace" button on the download page uses the browser's own
`beforeinstallprompt` API. Once `index.html` + `manifest.webmanifest` +
`sw.js` are deployed, tapping it on Android Chrome or desktop Chrome/Edge
installs a real app icon on the device/home screen/start menu — same
installed experience as a native app, backed by the exact same live site.
iOS Safari doesn't expose that API, so it shows Share → "Add to Home Screen"
instructions instead, which is the real, working iOS equivalent.

**Needs one CI run before it's downloadable:** the native `.apk`/`.exe`/
`.dmg`/`.AppImage` cards below the install button. I can't compile those
binaries myself in this chat sandbox (no Android SDK, Xcode, or network to
fetch electron-builder's toolchains) — the manifest endpoint correctly
reports each as "Coming soon" and keeps its card disabled until
`ci/.github/workflows/build-shell.yml` actually runs and deploys a real file.

## What I verified directly (not just reviewed)
- Every JS/JSX/TS file in this package compiles cleanly through a real
  esbuild binary (catches syntax errors, not just eyeballing).
- The download page was bundled with real React and run in headless
  Chromium (Playwright): confirmed the platform auto-detect correctly
  identifies the host OS, the Android card renders the live file size from a
  mocked manifest response with a working `download` attribute and correct
  `href`, and a not-yet-built platform's card is genuinely disabled
  (`pointer-events: none`, shows "Coming soon") rather than a dead link.
  This run caught and fixed a real bug: an unguarded `import.meta.env`
  access that would throw outside Vite's build-time replacement — now
  optional-chained.
- The install button was driven with a simulated `beforeinstallprompt`
  event: confirmed the button appears, calling `.click()` genuinely invokes
  the captured event's `.prompt()`, and the button correctly disappears once
  `appinstalled` fires.
- The backend download route's exact header/allowlist logic was run against
  a real HTTP server with a real 1MB test file: confirmed 200 + correct
  `Content-Type`/`Content-Disposition` + exact byte count for an existing
  file, 404 (not a fake success) for a file that hasn't been built yet, and
  404 for both path-traversal and non-allowlisted filename attempts.

## Build steps

### Android / iOS (mobile-shell/)
```
cd mobile-shell
npm install
npx cap add android
npx cap add ios
# Merge android-config/* into the generated android/ project (see comments in each file)
# Merge ios-config/* into the generated ios/ project (see comments in each file)
npx cap sync
npm run build:android   # produces a signed .apk via Gradle (assembleRelease),
                         # for direct download — not a Play Store .aab
npm run build:ios       # opens Xcode — archive & upload for TestFlight/App Store from there
```
For the direct-APK download flow (bypassing Play Store while pre-launch),
sign the release build and upload the `.apk` to wherever
`VITE_APK_DOWNLOAD_URL` points.

For universal links, host an `apple-app-site-association` file at
`https://jedidamarketplace.com/.well-known/apple-app-site-association`
mapping to the app's Team ID + bundle ID (`com.jedidamarketplace.app`), and an
equivalent `assetlinks.json` at `/.well-known/assetlinks.json` for Android App
Links (needed for `android:autoVerify="true"` in the manifest).

### Desktop (desktop-shell/)
```
cd desktop-shell
npm install
npm run dist        # builds Windows/macOS/Linux installers via electron-builder
```
Outputs land in `dist/`: an NSIS `.exe` for Windows, a `.dmg` for macOS, and
an `.AppImage`/`.deb` for Linux. `electron-updater` is wired to check
`https://jedidamarketplace.com/downloads/desktop` for new shell versions —
host the `latest.yml`/`latest-mac.yml` files electron-builder generates there
so existing installs auto-update the shell binary itself (separate from the
site content, which is always live).

### Frontend
Copy the two files under `frontend-patch/src/` into the corresponding paths
in `frontend/src/`, replacing the existing `DownloadApp.jsx`. Set
`VITE_WINDOWS_INSTALLER_URL`, `VITE_MACOS_INSTALLER_URL`,
`VITE_LINUX_INSTALLER_URL`, and `VITE_IOS_APP_STORE_URL` in the frontend's
`.env` once those files/listing are live.

## Security summary
- All traffic is HTTPS-only (Android network security config, iOS ATS,
  Electron session filter) — no cleartext exceptions.
- Navigation is restricted to `jedidamarketplace.com` and its subdomains at
  three independent layers per platform (JS allowlist, native
  WebViewClient/session filter, OS-level network config) — off-domain links
  (partner sites, payment redirects) always open in the system browser
  instead of inside the shell.
- Deep links (`jedidamarketplace://…` and universal/App Links) are validated
  against the official host/scheme before ever being loaded — malformed or
  spoofed links are dropped.
- Auth tokens use platform secure storage (Android Keystore /
  `capacitor-secure-storage-plugin`, iOS Keychain via the same plugin) rather
  than `localStorage`, when running inside the shell.
- Biometric login (`capacitor-native-biometric`) gates unlocking the stored
  refresh token — it does not replace the existing password/OAuth flow, it
  guards local access to it.

## Offline handling
Each platform swaps in a branded `offline.html` on load failure and
automatically reloads the production URL the moment connectivity returns
(`ConnectivityManager` on Android, `NWPathMonitor` on iOS, `online`/interval
check + Electron's own retry IPC on desktop) — no manual refresh needed in
the common case.
