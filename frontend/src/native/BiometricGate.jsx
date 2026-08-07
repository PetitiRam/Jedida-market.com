import { useEffect, useState } from 'react';
import { jedidaNative } from './jedidaNativeBridge';
import { rehydrateFromSecureStorage, hasStoredSession, isBiometricEnabled } from './authSession';
import Logo from '../components/Logo';

// Gates rendering of the app behind a biometric prompt on cold start, but
// only when the person opted in (see the prompt in SignIn.jsx) — this is a
// convenience unlock for a device the person already trusts, not a
// replacement for the actual password/OAuth login. A "no" here just means
// "ask again", never "sign out"; the stored session is untouched either way.
export default function BiometricGate({ children }) {
  const [state, setState] = useState('checking'); // checking | locked | unlocked | unavailable

  const attemptUnlock = async () => {
    const ok = await jedidaNative.verifyBiometric();
    if (ok) {
      jedidaNative.haptics.success();
      setState('unlocked');
    } else {
      jedidaNative.haptics.error();
      setState('locked'); // stays locked; the Unlock button lets them retry
    }
  };

  useEffect(() => {
    (async () => {
      await rehydrateFromSecureStorage();

      if (!jedidaNative.isNative() || !isBiometricEnabled() || !hasStoredSession()) {
        setState('unlocked');
        return;
      }

      setState('locked');
      await attemptUnlock(); // auto-prompt once on cold start, same as most native apps
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'checking') return null; // avoid a content flash before we know which state applies
  if (state === 'unlocked') return children;

  return (
    <div className="native-biometric-gate">
      <Logo size={48} light />
      <p>Unlock JEDIDA to continue</p>
      <button type="button" onClick={attemptUnlock} className="native-biometric-gate__button">
        Unlock
      </button>
    </div>
  );
}
