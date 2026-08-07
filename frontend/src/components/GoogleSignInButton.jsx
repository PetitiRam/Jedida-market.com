import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { persistLogin, getDeviceInfo } from '../native/authSession';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Renders Google's own "Continue with Google" button (via Google Identity
 * Services) and, on success, exchanges the returned ID token with our
 * backend at POST /auth/google — then stores the JWT pair exactly the
 * same way the email/password Sign In and Sign Up forms do, so every
 * other part of the app (axios interceptor, requireAuth, refresh) treats
 * a Google session identically to a password session.
 */
export default function GoogleSignInButton({ label = 'continue_with', referralCode }) {
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      // Not configured — render nothing rather than a broken button.
      return;
    }

    let cancelled = false;

    async function handleCredentialResponse(response) {
      setError('');
      setLoading(true);
      try {
        const device = await getDeviceInfo();
        const { data } = await client.post('/auth/google', { idToken: response.credential, device, referralCode });
        await persistLogin(data);
        navigate('/marketplace');
      } catch (err) {
        setError(err.response?.data?.error || 'Could not sign in with Google. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function renderButton() {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: label,
        shape: 'pill',
        width: 360
      });
    }

    if (window.google?.accounts?.id) {
      renderButton();
    } else {
      // The GIS script tag in index.html loads async — poll briefly until
      // it's ready rather than assuming it's already there.
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          renderButton();
        }
      }, 100);
      const timeout = setTimeout(() => clearInterval(interval), 10000);
      return () => {
        cancelled = true;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [navigate, label, referralCode]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="google-signin-block">
      {error && <div className="alert alert-error">{error}</div>}
      <div ref={buttonRef} className="google-signin-button" aria-busy={loading} />
      {loading && <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>Signing you in…</p>}
    </div>
  );
}
