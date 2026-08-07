// Drop this file into the EXISTING frontend at src/native/jedidaNativeBridge.js.
// It does NOT duplicate any UI — it's a thin feature-detection layer that the
// current components (MediaUploader, ShareShopButton, PasswordField, etc.)
// can optionally call. On the regular website it's a no-op; inside the
// Android/iOS shell, Capacitor's runtime is already present on `window`
// (injected automatically because the shell loads this site directly via
// server.url in capacitor.config.ts — nothing to install on the web side).

const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const isDesktop = () => !!window.jedidaDesktop?.isDesktop;
const plugins = () => window.Capacitor?.Plugins ?? {};

// One name for "what kind of shell is this running in", used by chrome
// components (bottom nav, status bar, splash) to branch without each of
// them re-deriving it.
function platform() {
  if (isDesktop()) return 'desktop';
  if (isNative()) return window.Capacitor?.getPlatform?.() ?? 'native'; // 'ios' | 'android'
  return 'web';
}

// Backing store for onBackButton below. Capacitor's own 'backButton' event
// has no consumption/stopPropagation concept — every listener registered
// via App.addListener fires on every press. To let a modal (e.g. full-screen
// chat) pre-empt the app-level nav handler in NativeAppShell.jsx instead of
// running alongside it, we register exactly ONE real native listener here
// and walk our own stack newest-first, stopping at the first handler that
// returns true.
const backButtonStack = [];
let backButtonListenerRegistered = false;

function ensureBackButtonListener() {
  if (backButtonListenerRegistered) return;
  backButtonListenerRegistered = true;
  const { App } = plugins();
  App?.addListener?.('backButton', () => {
    for (let i = backButtonStack.length - 1; i >= 0; i--) {
      if (backButtonStack[i]() === true) return;
    }
  });
}

export const jedidaNative = {
  isNative,
  isDesktop,
  platform,

  // --- Haptic feedback (tab taps, confirmations, destructive actions) ---
  // No-ops everywhere except a real native shell — callers never need to
  // branch on platform themselves.
  haptics: {
    async light() {
      if (!isNative()) return;
      const { Haptics, ImpactStyle } = plugins();
      return Haptics?.impact?.({ style: ImpactStyle?.Light ?? 'LIGHT' });
    },
    async medium() {
      if (!isNative()) return;
      const { Haptics, ImpactStyle } = plugins();
      return Haptics?.impact?.({ style: ImpactStyle?.Medium ?? 'MEDIUM' });
    },
    async success() {
      if (!isNative()) return;
      const { Haptics, NotificationType } = plugins();
      return Haptics?.notification?.({ type: NotificationType?.Success ?? 'SUCCESS' });
    },
    async warning() {
      if (!isNative()) return;
      const { Haptics, NotificationType } = plugins();
      return Haptics?.notification?.({ type: NotificationType?.Warning ?? 'WARNING' });
    },
    async error() {
      if (!isNative()) return;
      const { Haptics, NotificationType } = plugins();
      return Haptics?.notification?.({ type: NotificationType?.Error ?? 'ERROR' });
    }
  },

  // --- Status bar (kept in sync with the current page/theme by NativeAppShell) ---
  async setStatusBarStyle({ dark = true, backgroundColor } = {}) {
    if (!isNative()) return;
    const { StatusBar, Style } = plugins();
    await StatusBar?.setStyle?.({ style: dark ? (Style?.Dark ?? 'DARK') : (Style?.Light ?? 'LIGHT') });
    if (backgroundColor && window.Capacitor?.getPlatform?.() === 'android') {
      await StatusBar?.setBackgroundColor?.({ color: backgroundColor });
    }
  },

  // --- App lifecycle: unifies Capacitor's appStateChange, Electron's
  // focus/blur (via window.jedidaDesktop), and the web Page Visibility API
  // behind one callback so a page never needs three separate branches.
  // Returns an unsubscribe function.
  onLifecycleChange(callback) {
    if (isNative()) {
      const { App } = plugins();
      const handle = App?.addListener?.('appStateChange', ({ isActive }) => callback(isActive));
      return () => handle?.remove?.();
    }
    if (isDesktop() && window.jedidaDesktop?.onLifecycleChange) {
      return window.jedidaDesktop.onLifecycleChange(callback);
    }
    const onVisibility = () => callback(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  },

  // --- Hardware back button (Android only; no-op elsewhere). Handlers run
  // most-recently-registered-first, so a modal/drawer can consume the event
  // before it reaches app-level exit-confirmation. Return `true` from
  // `handler` to stop the event there. Returns an unsubscribe function.
  onBackButton(handler) {
    if (!isNative()) return () => {};
    backButtonStack.push(handler);
    ensureBackButtonListener();
    return () => {
      const i = backButtonStack.indexOf(handler);
      if (i !== -1) backButtonStack.splice(i, 1);
    };
  },

  exitApp() {
    if (!isNative()) return;
    const { App } = plugins();
    App?.exitApp?.();
  },

  // --- Camera / photo & file uploads (used by MediaUploader.jsx, ProductMediaDropzone.jsx) ---
  async takePhoto() {
    if (!isNative()) return null; // caller falls back to <input type="file" capture>
    const { Camera } = plugins();
    const photo = await Camera.getPhoto({ resultType: 'uri', quality: 85 });
    return photo.webPath;
  },

  async pickFile() {
    if (!isNative()) return null; // caller falls back to a normal <input type="file">
    const { Camera } = plugins();
    const photo = await Camera.pickImages({ quality: 85, limit: 1 });
    return photo.photos?.[0]?.webPath ?? null;
  },

  // --- QR scanning (seller "Track shipment" / buyer product lookup flows) ---
  async scanQRCode() {
    if (!isNative()) return null; // caller falls back to manual code entry
    const { BarcodeScanner } = plugins();
    await BarcodeScanner.checkPermission({ force: true });
    await BarcodeScanner.hideBackground();
    const result = await BarcodeScanner.startScan();
    await BarcodeScanner.showBackground();
    return result.hasContent ? result.content : null;
  },

  // --- Share (used by ShareShopButton.jsx) ---
  async share({ title, text, url }) {
    if (!isNative()) return navigator.share ? navigator.share({ title, text, url }) : null;
    const { Share } = plugins();
    return Share.share({ title, text, url, dialogTitle: title });
  },

  // --- Clipboard ---
  async copyToClipboard(text) {
    if (!isNative()) return navigator.clipboard?.writeText(text);
    const { Clipboard } = plugins();
    return Clipboard.write({ string: text });
  },

  // --- Secure token storage (used by the auth layer instead of localStorage) ---
  async setSecureItem(key, value) {
    if (!isNative()) return localStorage.setItem(key, value);
    const { SecureStoragePlugin } = plugins();
    return SecureStoragePlugin.set({ key, value });
  },
  async getSecureItem(key) {
    if (!isNative()) return localStorage.getItem(key);
    const { SecureStoragePlugin } = plugins();
    try {
      const { value } = await SecureStoragePlugin.get({ key });
      return value;
    } catch {
      return null; // key not found
    }
  },
  async removeSecureItem(key) {
    if (!isNative()) return localStorage.removeItem(key);
    const { SecureStoragePlugin } = plugins();
    return SecureStoragePlugin.remove({ key });
  },

  // --- Biometric login (gates unlocking the stored refresh token) ---
  async biometricLoginAvailable() {
    if (!isNative()) return false;
    const { NativeBiometric } = plugins();
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  },
  async verifyBiometric(reason = 'Sign in to JEDIDA Marketplace') {
    if (!isNative()) return false;
    const { NativeBiometric } = plugins();
    try {
      await NativeBiometric.verifyIdentity({ reason, title: 'JEDIDA Marketplace' });
      return true;
    } catch {
      return false;
    }
  },

  // --- Push notifications ---
  // Web has no equivalent flow here (no service-worker push wired yet) —
  // registerPush/onPushReceived/onPushTapped are all no-ops outside a
  // native shell, matching the platform() = 'web' fallback used everywhere
  // else in this file.
  async registerPush(onToken) {
    if (!isNative()) return;
    const { PushNotifications } = plugins();
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.register();
    PushNotifications.addListener('registration', (token) => onToken?.(token.value));
    PushNotifications.addListener('registrationError', (err) => console.error('Push registration error:', err));
  },

  // Called on logout so the token can be removed server-side too.
  async getCurrentPushToken() {
    if (!isNative()) return null;
    return new Promise((resolve) => {
      const { PushNotifications } = plugins();
      const handle = PushNotifications?.addListener?.('registration', (token) => {
        handle?.remove?.();
        resolve(token.value);
      });
      PushNotifications?.register?.();
    });
  },

  // Notification arrives while the app is open/foregrounded — caller
  // decides how to surface it (e.g. an in-app toast + unread badge bump)
  // since a system banner won't show automatically in that case.
  onPushReceived(callback) {
    if (!isNative()) return () => {};
    const { PushNotifications } = plugins();
    const handle = PushNotifications?.addListener?.('pushNotificationReceived', (notification) => callback(notification));
    return () => handle?.remove?.();
  },

  // User tapped a notification (app was backgrounded/closed) — `data` carries
  // whatever the backend sent (see pushService.js: { type, conversationId }),
  // used to deep-link straight into that conversation.
  onPushTapped(callback) {
    if (!isNative()) return () => {};
    const { PushNotifications } = plugins();
    const handle = PushNotifications?.addListener?.('pushNotificationActionPerformed', (action) => {
      callback(action.notification?.data ?? {});
    });
    return () => handle?.remove?.();
  },

  // --- Network status (used to show the existing app's own offline banner, if it has one) ---
  onNetworkChange(callback) {
    if (!isNative()) {
      window.addEventListener('online', () => callback(true));
      window.addEventListener('offline', () => callback(false));
      return;
    }
    const { Network } = plugins();
    Network.addListener('networkStatusChange', (status) => callback(status.connected));
  }
};
