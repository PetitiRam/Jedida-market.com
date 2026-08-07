import type { CapacitorConfig } from '@capacitor/cli';

// The shell has almost no logic of its own — it points at the live production
// site and lets that site run inside the native WebView. Ship a new app
// version only when something in THIS file, a native plugin, or a
// platform config file changes. Anything under jedidamarketplace.com goes
// live the moment it's deployed, with zero app-store step.
const PRODUCTION_URL = 'https://jedidamarketplace.com';

const config: CapacitorConfig = {
  appId: 'com.jedidamarketplace.app',
  appName: 'JEDIDA Marketplace',
  webDir: 'www', // only used for the offline/splash fallback shipped in-app
  bundledWebRuntime: false,

  server: {
    // Load the live site directly instead of bundling a copy of the frontend.
    url: PRODUCTION_URL,
    cleartext: false,
    // Anything outside these hosts opens in the system browser instead of
    // navigating the shell's WebView (see NavigationGuard in src/bridge.js
    // and the platform-level allowlists in android-config / ios-config).
    allowNavigation: [
      'jedidamarketplace.com',
      '*.jedidamarketplace.com'
    ]
  },

  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0B3D24',
    // Universal Links / associated domains are declared in ios-config/jedida.entitlements
    scheme: 'JedidaMarketplace'
  },

  android: {
    backgroundColor: '#0B3D24',
    allowMixedContent: false,
    // Deep link intent-filter lives in android-config/AndroidManifest.additions.xml
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#0B3D24',
      androidSplashResourceName: 'splash',
      showSpinner: true,
      spinnerColor: '#8BC53F'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    App: {
      // handled via appUrlOpen listener in src/bridge.js
    },
    Keyboard: {
      // 'body' resizes the WebView content (not just the viewport) when the
      // keyboard opens, so a focused input never ends up hidden behind it —
      // the difference between forms feeling native vs. feeling like a page
      // in a browser tab.
      resize: 'body',
      style: 'dark'
    }
  }
};

export default config;
