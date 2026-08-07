import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { proactiveRefresh } from '../api/client';
import { hasStoredSession } from './authSession';

// Chrome-level session plumbing, mounted once near the app root. Listens
// for the two lifecycle signals the rest of the native layer already
// produces — Phase 1's jedida:foreground/background events and client.js's
// jedida:session-expired — and turns them into the two things a person
// actually notices: the app "just works" after being backgrounded for a
// while, and a truly dead session bounces to sign-in instead of silently
// failing every request.
export default function SessionGuard() {
  const navigate = useNavigate();

  useEffect(() => {
    const onForeground = () => {
      if (hasStoredSession()) proactiveRefresh();
    };
    const onSessionExpired = () => {
      if (window.location.pathname !== '/signin') navigate('/signin');
    };

    window.addEventListener('jedida:foreground', onForeground);
    window.addEventListener('jedida:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('jedida:foreground', onForeground);
      window.removeEventListener('jedida:session-expired', onSessionExpired);
    };
  }, [navigate]);

  return null;
}
