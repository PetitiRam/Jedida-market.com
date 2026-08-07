// Native Google Sign-In for the Expo app. Uses expo-auth-session's Google
// provider to obtain a Google ID token (works inside Expo Go — no native
// module / custom dev client required), then sends that ID token to the
// exact same backend endpoint the web app uses (POST /auth/google), and
// stores the returned JWT pair in SecureStore. Every existing
// buyer/seller/delivery/admin/staff account and role check works
// identically afterward, since the backend issues the same JWT shape
// regardless of how the session started.
//
// Setup required (one-time, in Google Cloud Console → Credentials):
//   - a Web application OAuth client (its ID is what the *backend*
//     verifies against as GOOGLE_CLIENT_ID — reused here as webClientId
//     so Expo Go's auth proxy, which always returns a token whose
//     audience is the web client, verifies correctly)
//   - optionally, dedicated iOS / Android OAuth clients for standalone
//     (non-Expo-Go) builds — see GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID
//     on the backend and the matching app.config values below.

import { useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import api from './api';
import { saveSession } from './secureStorage';

WebBrowser.maybeCompleteAuthSession();

const extra = Constants.expoConfig?.extra || {};

/**
 * Drop-in hook for a Sign In / Sign Up screen.
 *
 * const { promptGoogleSignIn, googleRequestReady, googleError, googleLoading } =
 *   useGoogleSignIn({ onSuccess: (result) => navigation.replace('Marketplace') });
 *
 * <Button title="Continue with Google" disabled={!googleRequestReady} onPress={promptGoogleSignIn} />
 */
export function useGoogleSignIn({ onSuccess, onError } = {}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: extra.googleWebClientId,
    iosClientId: extra.googleIosClientId,
    androidClientId: extra.googleAndroidClientId
  });

  useEffect(() => {
    if (response?.type !== 'success') return;

    const idToken = response.params?.id_token;
    if (!idToken) return;

    (async () => {
      try {
        const { data } = await api.post('/auth/google', { idToken });
        await saveSession(data);
        onSuccess?.(data);
      } catch (err) {
        onError?.(err.response?.data?.error || 'Could not sign in with Google. Please try again.');
      }
    })();
  }, [response]);

  return {
    googleRequestReady: Boolean(request),
    promptGoogleSignIn: () => promptAsync(),
  };
}
