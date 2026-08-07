import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import AuthLayoutV2 from '../components/auth/AuthLayoutV2';
import AuthSkeleton from '../components/auth/AuthSkeleton';
import FloatingInput from '../components/auth/FloatingInput';
import PasswordField from '../components/auth/PasswordField';
import LocationPhoneSelectorV2 from '../components/auth/LocationPhoneSelectorV2';
import Checkbox from '../components/auth/Checkbox';
import AuthButton from '../components/auth/AuthButton';
import GoogleSignInButton from '../components/GoogleSignInButton';
import Icon from '../components/icons/icon';
import client from '../api/client';
import { persistLogin, getDeviceInfo } from '../native/authSession';

const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, and a number.';

export default function SignUp() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref') || undefined;
  const [step, setStep] = useState(1);
  const [registrationToken, setRegistrationToken] = useState('');
  const [error, setError] = useState('');
  const [buttonState, setButtonState] = useState('idle'); // idle | loading | success
  const [pageReady, setPageReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPageReady(true), 320);
    return () => clearTimeout(t);
  }, []);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [countryIso2, setCountryIso2] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [dialCode, setDialCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const submitStep1 = async (e) => {
    e.preventDefault();
    setError('');
    if (!dialCode || !phoneNumber) {
      setError('Please select your country code and enter your phone number.');
      return;
    }
    setButtonState('loading');
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const fullPhoneNumber = `${dialCode}${phoneNumber.replace(/^0+/, '')}`;
      const { data } = await client.post('/auth/register/step-1', {
        fullName, email, phoneNumber: fullPhoneNumber, referralCode
      });
      setRegistrationToken(data.registrationToken);
      setButtonState('idle');
      setStep(2);
    } catch (err) {
      setButtonState('idle');
      setError(err.response?.data?.error || 'Could not verify your details. Please try again.');
    }
  };

  const submitStep2 = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!termsAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setButtonState('loading');
    try {
      const device = await getDeviceInfo();
      const { data } = await client.post('/auth/register/step-2', {
        registrationToken, username, password, device
      });
      await persistLogin(data);
      setButtonState('success');
      setTimeout(() => navigate('/marketplace'), 500);
    } catch (err) {
      setButtonState('idle');
      setError(err.response?.data?.error || 'Could not create your account. Please try again.');
    }
  };

  return (
    <AuthLayoutV2>
      {!pageReady ? (
        <AuthSkeleton fields={4} />
      ) : (
        <>
          <div className="jd-auth-eyebrow">Get started — Step {step} of 2</div>

          {step === 1 ? (
            <div className="jd-auth-step">
              <h1 className="jd-auth-title">Create your buyer account</h1>

              {error && (
                <div className="jd-alert jd-alert-error">
                  <Icon name="x" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="jd-auth-google">
                <GoogleSignInButton label="signup_with" referralCode={referralCode} />
              </div>
              <div className="jd-auth-divider">or sign up with email</div>

              <form onSubmit={submitStep1} noValidate>
                <div className="jd-field-row">
                  <FloatingInput
                    id="firstName"
                    label="First name"
                    icon="user"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                  <FloatingInput
                    id="lastName"
                    label="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                  />
                </div>

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

                <LocationPhoneSelectorV2
                  countryIso2={countryIso2} onCountryChange={setCountryIso2}
                  city={locationCity} onCityChange={setLocationCity}
                  dialCode={dialCode} onDialCodeChange={setDialCode}
                  phoneNumber={phoneNumber} onPhoneNumberChange={setPhoneNumber}
                />

                <AuthButton
                  state={buttonState}
                  disabled={!firstName || !lastName || !email}
                  successLabel="Verified"
                  loadingLabel="Checking…"
                >
                  Continue
                </AuthButton>
              </form>
            </div>
          ) : (
            <div className="jd-auth-step">
              <h1 className="jd-auth-title">Set your username and password</h1>

              {error && (
                <div className="jd-alert jd-alert-error">
                  <Icon name="x" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={submitStep2} noValidate>
                <FloatingInput
                  id="username"
                  label="Username"
                  icon="user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  pattern="[a-z0-9_.]{3,30}"
                  required
                  autoComplete="username"
                />

                <PasswordField
                  id="password"
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  showStrength
                />
                <p className="jd-strength-label" style={{ marginTop: -8, marginBottom: 18 }}>{PASSWORD_HINT}</p>

                <PasswordField
                  id="confirmPassword"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  valid={confirmPassword ? confirmPassword === password : undefined}
                  error={confirmPassword && confirmPassword !== password ? 'Passwords do not match' : ''}
                />

                <Checkbox checked={termsAccepted} onChange={setTermsAccepted} id="termsAccepted">
                  I agree to the <Link to="/legal/terms_of_service" target="_blank" rel="noopener noreferrer">Terms of Service</Link> and{' '}
                  <Link to="/legal/privacy_policy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
                </Checkbox>

                <div style={{ marginTop: 20 }}>
                  <AuthButton
                    state={buttonState}
                    disabled={!username || !password || !confirmPassword || !termsAccepted}
                    successLabel="Account created"
                    loadingLabel="Creating your account…"
                  >
                    Create account
                  </AuthButton>
                </div>

                <button type="button" className="jd-btn-ghost" style={{ marginTop: 14 }} onClick={() => setStep(1)}>
                  <Icon name="chevronLeft" size={15} /> Back
                </button>
              </form>
            </div>
          )}

          <p className="jd-auth-footnote">
            Already have an account? <Link to="/signin" className="jd-link">Sign in</Link>
          </p>
        </>
      )}
    </AuthLayoutV2>
  );
}
