import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import AuthLayoutV2 from '../components/auth/AuthLayoutV2';
import AuthSkeleton from '../components/auth/AuthSkeleton';
import FloatingInput from '../components/auth/FloatingInput';
import PasswordField from '../components/auth/PasswordField';
import Checkbox from '../components/auth/Checkbox';
import AuthButton from '../components/auth/AuthButton';
import GoogleSignInButton from '../components/GoogleSignInButton';
import Icon from '../components/icons/icon';
import client from '../api/client';
import { jedidaNative } from '../native/jedidaNativeBridge';
import { persistLogin, getDeviceInfo, setBiometricEnabled } from '../native/authSession';

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Optional ?next=/some/path — used by the Developer Platform's "Existing
  // Developer Login" entry point so signing in lands back on the dev
  // dashboard instead of the consumer marketplace. Falls back to the usual
  // destination when absent.
  const nextPath = searchParams.get('next') || '/marketplace';

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Second step of login for accounts with 2FA enabled — see
  // POST /api/auth/2fa/login-verify. mfaToken is the short-lived
  // challenge token login() returns instead of real session tokens.
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const [error, setError] = useState('');
  const [buttonState, setButtonState] = useState('idle'); // idle | loading | success
  const [pageReady, setPageReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPageReady(true), 320);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setButtonState('loading');
    try {
      const device = await getDeviceInfo();
      const { data } = await client.post('/auth/login', { email, username, password, device });

      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setButtonState('idle');
        return;
      }

      await finishLogin(data);
    } catch (err) {
      setButtonState('idle');
      setError(err.response?.data?.error || 'Could not sign in. Please try again.');
    }
  };

  const finishLogin = async (data) => {
    await persistLogin(data);
    setButtonState('success');

    if (jedidaNative.isNative() && await jedidaNative.biometricLoginAvailable()) {
      // Fire-and-forget prompt — declining just means biometric unlock
      // stays off; it never blocks the sign-in that already succeeded.
      const enable = window.confirm('Use Face/Touch ID to unlock JEDIDA next time?');
      setBiometricEnabled(enable);
    }

    setTimeout(() => navigate(nextPath), 500);
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setButtonState('loading');
    try {
      const device = await getDeviceInfo();
      const payload = useBackupCode
        ? { mfaToken, backupCode: mfaCode, device }
        : { mfaToken, code: mfaCode, device };
      const { data } = await client.post('/auth/2fa/login-verify', payload);
      if (data.warning) setError(data.warning);
      await finishLogin(data);
    } catch (err) {
      setButtonState('idle');
      setError(err.response?.data?.error || 'Could not verify your code. Please try again.');
    }
  };

  return (
    <AuthLayoutV2>
      {!pageReady ? (
        <AuthSkeleton fields={3} />
      ) : (
        <>
          <div className="jd-auth-eyebrow">Welcome back</div>
          <h1 className="jd-auth-title">{mfaToken ? 'Enter your security code' : 'Sign in to JEDIDA'}</h1>

          {error && (
            <div className="jd-alert jd-alert-error">
              <Icon name="x" size={16} />
              <span>{error}</span>
            </div>
          )}

          {mfaToken ? (
            <form onSubmit={handleMfaSubmit} noValidate>
              <FloatingInput
                id="mfaCode"
                label={useBackupCode ? 'Backup code' : '6-digit code'}
                icon="lock"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                required
                autoComplete="one-time-code"
                autoFocus
              />

              <p className="jd-auth-footnote" style={{ marginTop: 0 }}>
                {useBackupCode
                  ? 'Enter one of the backup codes you saved when you set up two-factor authentication.'
                  : 'Enter the 6-digit code from your authenticator app.'}{' '}
                <button
                  type="button"
                  className="jd-link"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => { setUseBackupCode((v) => !v); setMfaCode(''); setError(''); }}
                >
                  {useBackupCode ? 'Use authenticator code instead' : 'Use a backup code instead'}
                </button>
              </p>

              <AuthButton state={buttonState} disabled={!mfaCode} successLabel="Signed in">
                Verify
              </AuthButton>

              <p className="jd-auth-footnote">
                <button
                  type="button"
                  className="jd-link"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => { setMfaToken(null); setMfaCode(''); setError(''); }}
                >
                  ← Back to sign in
                </button>
              </p>
            </form>
          ) : (
            <>
              <div className="jd-auth-google">
                <GoogleSignInButton label="signin_with" />
              </div>
              <div className="jd-auth-divider">or sign in with email</div>

              <form onSubmit={handleSubmit} noValidate>
            <FloatingInput
              id="email"
              label="Email address"
              type="email"
              icon="mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <FloatingInput
              id="username"
              label="Username"
              icon="user"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
              autoComplete="username"
            />

            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <div className="jd-row-between">
              <Checkbox checked={rememberMe} onChange={setRememberMe} id="rememberMe">
                Remember me
              </Checkbox>
              <Link to="/forgot-password" className="jd-link" style={{ fontSize: '0.86rem' }}>
                Forgot password?
              </Link>
            </div>

            <AuthButton state={buttonState} disabled={!email || !username || !password} successLabel="Signed in">
              Sign in
            </AuthButton>
              </form>

              <p className="jd-auth-footnote">
                New to JEDIDA? <Link to="/signup" className="jd-link">Create an account</Link>
              </p>
            </>
          )}
        </>
      )}
    </AuthLayoutV2>
  );
}
