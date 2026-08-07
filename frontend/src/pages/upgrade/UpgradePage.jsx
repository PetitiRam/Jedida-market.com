import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import Logo from '../../components/Logo';
import MediaUploader from '../../components/MediaUploader';
import ChatPanel from '../../components/ChatPanel';
import './upgrade.css';

const BENEFITS = [
  { icon: '🛡️', title: 'Verified Seller Badge', body: 'Gain trust and credibility with buyers.' },
  { icon: '🗂️', title: 'More Products', body: 'List unlimited products in your shop.' },
  { icon: '📈', title: 'Advanced Analytics', body: 'Track sales, views, and growth over time.' },
  { icon: '⚡', title: 'Priority Support', body: 'Get faster responses from the admin team.' },
  { icon: '📣', title: 'Marketing Tools', body: 'Boost your visibility across the marketplace.' },
  { icon: '💰', title: 'Lower Marketplace Fees', body: 'Save more on every sale you make.' },
  { icon: '🏷️', title: 'Campaigns & Discounts', body: 'Run promotions and special offers.' },
  { icon: '🤖', title: 'AI Business Assistant', body: 'Smart, tailored recommendations for your shop.' }
];

// Manufacturer/supplier/dropshipper accounts — built on the same
// upgrade + business-verification flow as seller, but as company
// accounts rather than an individual's shop. Kept in one place so the
// type grid, field labels, and summary text all stay in sync.
const BUSINESS_ROLE_INFO = {
  manufacturer: { icon: '🏭', label: 'Manufacturer Upgrade', body: 'Produce goods and supply sellers, suppliers, and dropshippers at wholesale prices.' },
  supplier: { icon: '📦', label: 'Supplier Upgrade', body: 'Stock and distribute wholesale products to sellers and dropshippers.' },
  dropshipper: { icon: '🚀', label: 'Dropshipper Upgrade', body: 'Resell supplier and manufacturer products without holding your own inventory.' },
  farmer: { icon: '🌾', label: 'Farmer Upgrade', body: 'List bulk harvests, set seasonal availability, and reach verified buyers and traders directly.' },
  host: { icon: '🏡', label: 'Jedida Stays Host', body: 'List apartments, villas, lodges, and other short-stay properties with a full booking calendar, media gallery, and Digital Stay Pass.' }
};
const BUSINESS_ROLES = Object.keys(BUSINESS_ROLE_INFO);
const ROLES_REQUIRING_REGISTRATION_NUMBER = ['manufacturer', 'supplier'];
const ROLES_REQUIRING_VERIFICATION_DOCS = ['manufacturer', 'supplier'];

const COMPARE_ROWS = [
  { label: 'Product listings', free: 'Up to 20 products', pro: 'Unlimited products' },
  { label: 'Shop customization', free: 'Basic', pro: 'Advanced customization' },
  { label: 'Analytics & reports', free: 'Basic reports', pro: 'Advanced reports & insights' },
  { label: 'Discounts & campaigns', free: false, pro: 'Create discounts & campaigns' },
  { label: 'Priority support', free: false, pro: '24/7 priority support' },
  { label: 'Verified badge', free: false, pro: 'Verified seller badge' },
  { label: 'Marketplace fees', free: 'Standard fees', pro: 'Lower marketplace fees' },
  { label: 'AI business assistant', free: false, pro: 'AI recommendations & tools' }
];

// Post-payment tracker stages shown to the user. `key` groups one or more
// backend statuses into a single visual stage so the tracker reads cleanly.
const STAGES = ['submitted', 'verifying', 'review', 'approved'];

function stageForStatus(status) {
  if (['pending_payment', 'payment_submitted'].includes(status)) return 0;
  if (['payment_verified', 'payment_rejected'].includes(status)) return 1;
  if (['kyc_pending', 'kyc_verified', 'kyc_rejected'].includes(status)) return 2;
  if (status === 'approved') return 3;
  return 0;
}

function RippleButton({ children, className, onClick, disabled, type = 'button', style }) {
  const handleClick = (e) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    ripple.className = 'upg-ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
    onClick?.(e);
  };
  return (
    <button type={type} className={className} style={style} onClick={handleClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function UpgradePage({ initialType = 'seller' }) {
  const navigate = useNavigate();

  const [pricing, setPricing] = useState({ countries: [] });
  const [loadingPricing, setLoadingPricing] = useState(true);

  const [upgradeType, setUpgradeType] = useState(initialType);
  const [country, setCountry] = useState('UG');
  const [provider, setProvider] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [phase, setPhase] = useState('form'); // form | submitting | tracking
  const [error, setError] = useState('');
  const [upgrade, setUpgrade] = useState(null);

  // Inline KYC (sellers only) — required by the existing approval state
  // machine before an admin can grant the seller role.
  const [idFront, setIdFront] = useState('');
  const [idBack, setIdBack] = useState('');
  const [selfie, setSelfie] = useState('');
  const [kycBusy, setKycBusy] = useState(false);

  // Business verification (manufacturer/supplier/dropshipper) — company
  // details + at least one document, required before admin approval for
  // manufacturer/supplier (see ROLES_REQUIRING_VERIFICATION_DOCS).
  const [companyAddress, setCompanyAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [businessDocUrl, setBusinessDocUrl] = useState('');
  const [businessDocName, setBusinessDocName] = useState('');
  const [businessVerifyBusy, setBusinessVerifyBusy] = useState(false);

  const pollRef = useRef(null);
  const greetedRef = useRef(false);

  // ---- Load pricing + auto-detect country ----
  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.get('/upgrade/pricing');
        setPricing(data);
        let detected = data.defaultCountry || 'UG';
        try {
          const geo = await fetch('https://ipapi.co/json/').then((r) => r.json());
          if (geo?.country_code && data.countries.some((c) => c.code === geo.country_code)) {
            detected = geo.country_code;
          }
        } catch { /* auto-detect best-effort only */ }
        setCountry(detected);
      } catch {
        setPricing({ countries: [] });
      } finally {
        setLoadingPricing(false);
      }
    })();
  }, []);

  // ---- Check for an existing in-progress upgrade on load ----
  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.get('/upgrade/status');
        const active = (data.upgrades || []).find((u) => !['rejected', 'payment_rejected', 'kyc_rejected'].includes(u.status));
        if (active) {
          setUpgrade(active);
          setUpgradeType(active.requested_role);
          setPhase('tracking');
        }
      } catch { /* not fatal — user just sees the form */ }
    })();
  }, []);

  // ---- Poll status while tracking ----
  useEffect(() => {
    if (phase !== 'tracking' || !upgrade || upgrade.status === 'approved') return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await client.get('/upgrade/status');
        const mine = (data.upgrades || []).find((u) => u.id === upgrade.id);
        if (mine) setUpgrade(mine);
      } catch { /* keep last known state */ }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [phase, upgrade?.id, upgrade?.status]);

  // ---- Once approved, refresh the JWT so the new role is active, then go ----
  useEffect(() => {
    if (upgrade?.status !== 'approved') return;
    (async () => {
      try {
        const refreshToken = localStorage.getItem('jedida_refresh_token');
        if (refreshToken) {
          const { data } = await client.post('/auth/refresh', { refreshToken });
          if (data?.accessToken) localStorage.setItem('jedida_access_token', data.accessToken);
        }
      } catch { /* user can still navigate manually */ }
    })();
  }, [upgrade?.status]);

  const countryEntry = pricing.countries.find((c) => c.code === country);
  const providers = countryEntry?.providers?.length ? countryEntry.providers : [{ id: 'mobile_money', name: 'Mobile Money' }];
  const amount = countryEntry ? (upgradeType === 'delivery' ? countryEntry.deliveryAmount : countryEntry.sellerAmount) : '—';
  const currency = countryEntry?.currency || 'UGX';

  useEffect(() => {
    if (providers.length && !providers.some((p) => p.id === provider)) {
      setProvider(providers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, upgradeType, pricing]);

  const canSubmit = agreed && mobileNumber.trim().length >= 6 && provider && country
    && (upgradeType !== 'seller' || businessName.trim().length > 0)
    && (!BUSINESS_ROLES.includes(upgradeType) || businessName.trim().length > 0)
    && (!ROLES_REQUIRING_REGISTRATION_NUMBER.includes(upgradeType) || registrationNumber.trim().length > 0);

  const submitUpgrade = async () => {
    setError('');
    setPhase('submitting');
    try {
      const { data } = await client.post('/upgrade/one-time', {
        requestedRole: upgradeType,
        country,
        mobileProvider: provider,
        mobileNumber,
        businessName: (upgradeType === 'seller' || BUSINESS_ROLES.includes(upgradeType)) ? businessName : undefined,
        registrationNumber: ROLES_REQUIRING_REGISTRATION_NUMBER.includes(upgradeType) ? registrationNumber : undefined
      });
      setUpgrade(data.upgrade);
      setPhase('tracking');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit your payment. Please try again.');
      setPhase('form');
    }
  };

  const submitKyc = async (e) => {
    e.preventDefault();
    setKycBusy(true); setError('');
    try {
      await client.post('/upgrade/kyc', { upgradeId: upgrade.id, nationalIdFrontUrl: idFront, nationalIdBackUrl: idBack, selfieUrl: selfie });
      const { data } = await client.get('/upgrade/status');
      const mine = (data.upgrades || []).find((u) => u.id === upgrade.id);
      if (mine) setUpgrade(mine);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit KYC documents.');
    } finally {
      setKycBusy(false);
    }
  };

  const submitBusinessVerification = async (e) => {
    e.preventDefault();
    setBusinessVerifyBusy(true); setError('');
    try {
      const documents = businessDocUrl ? [{ docType: 'business_license', fileName: businessDocName, fileUrl: businessDocUrl }] : [];
      await client.post('/upgrade/business-verification', {
        upgradeId: upgrade.id,
        companyAddress,
        website,
        documents
      });
      const { data } = await client.get('/upgrade/status');
      const mine = (data.upgrades || []).find((u) => u.id === upgrade.id);
      if (mine) setUpgrade(mine);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit business verification.');
    } finally {
      setBusinessVerifyBusy(false);
    }
  };

  // ---- AI assistant auto-greeting: as soon as the user lands on the form
  // (with pricing + a default country/provider resolved), have the AI chat
  // send them the platform's payment details, mirrored to notifications.
  // Fires once per visit — never re-fires as the user tweaks the form.
  useEffect(() => {
    if (greetedRef.current || phase !== 'form' || loadingPricing || !provider) return;
    greetedRef.current = true;
    client.post('/upgrade/payment-instructions', { requestedRole: upgradeType, country })
      .catch(() => { greetedRef.current = false; }); // allow retry if it failed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, loadingPricing, provider]);

  const providerName = providers.find((p) => p.id === provider)?.name || '—';
  const countryName = countryEntry?.countryName || country;
  // Step 1 is always "select type". Steps 2+ are business name (seller +
  // business roles) and registration number (manufacturer/supplier only) —
  // count how many of those show up before renumbering country/provider/etc.
  const stepOffset = 1
    + ((upgradeType === 'seller' || BUSINESS_ROLES.includes(upgradeType)) ? 1 : 0)
    + (ROLES_REQUIRING_REGISTRATION_NUMBER.includes(upgradeType) ? 1 : 0);

  return (
    <div className="upg-page">
      <div className="upg-shell">
        <div className="upg-topbar">
          <Logo size={34} />
          <div className="upg-secure-badge">
            <span style={{ fontSize: '1.2rem' }}>✅</span>
            <span>
              <strong>100% Secure Payment</strong>
              <span>Your payment is safe with Jedida</span>
            </span>
          </div>
        </div>

        <div className="upg-hero">
          {/* ============ LEFT: form / status ============ */}
          <div className="upg-glass-card">
            {phase !== 'tracking' && (
              <>
                <h2 className="upg-title">Upgrade Your Account</h2>
                <p className="upg-subtitle">Unlock premium features and grow your business on Jedida Marketplace.</p>
                <div className="upg-onetime-chip">🔒 One-time payment · No subscriptions · Lifetime benefits</div>
              </>
            )}

            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

            {phase === 'form' && (
              <>
                <div className="upg-step-label">1. Select upgrade type</div>
                <div className="upg-type-grid">
                  <div className={`upg-type-card ${upgradeType === 'seller' ? 'active' : ''}`} onClick={() => setUpgradeType('seller')}>
                    {upgradeType === 'seller' && <span className="upg-type-check">✓</span>}
                    <div className="upg-type-icon">🏬</div>
                    <div><h4>Seller Upgrade</h4><p>Unlock powerful tools to grow your shop and increase sales.</p></div>
                  </div>
                  <div className={`upg-type-card ${upgradeType === 'delivery' ? 'active' : ''}`} onClick={() => setUpgradeType('delivery')}>
                    {upgradeType === 'delivery' && <span className="upg-type-check">✓</span>}
                    <div className="upg-type-icon">🛵</div>
                    <div><h4>Delivery Upgrade</h4><p>Unlock professional delivery tools and earn more.</p></div>
                  </div>
                  {BUSINESS_ROLES.map((role) => (
                    <div key={role} className={`upg-type-card ${upgradeType === role ? 'active' : ''}`} onClick={() => setUpgradeType(role)}>
                      {upgradeType === role && <span className="upg-type-check">✓</span>}
                      <div className="upg-type-icon">{BUSINESS_ROLE_INFO[role].icon}</div>
                      <div><h4>{BUSINESS_ROLE_INFO[role].label}</h4><p>{BUSINESS_ROLE_INFO[role].body}</p></div>
                    </div>
                  ))}
                </div>

                {(upgradeType === 'seller' || BUSINESS_ROLES.includes(upgradeType)) && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="upg-step-label">2. {BUSINESS_ROLES.includes(upgradeType) ? 'Company / business name' : 'Shop / business name'}</div>
                    <div className="upg-input-wrap">
                      <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Amina's Fashion House" />
                    </div>
                  </div>
                )}

                {ROLES_REQUIRING_REGISTRATION_NUMBER.includes(upgradeType) && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="upg-step-label">3. Business registration number</div>
                    <div className="upg-input-wrap">
                      <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="e.g. UG/BRN/2024/00123" />
                    </div>
                  </div>
                )}

                <div className="upg-field-row">
                  <div>
                    <div className="upg-step-label">
                      {stepOffset}. Your country
                      <span className="upg-auto-badge">📍 auto-detected</span>
                    </div>
                    <div className="upg-select-wrap">
                      <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={loadingPricing}>
                        {pricing.countries.map((c) => (
                          <option key={c.code} value={c.code}>{c.countryName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="upg-step-label">{stepOffset + 1}. Mobile money provider</div>
                    <div className="upg-select-wrap">
                      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="upg-field-hint">Only providers available in {countryName} are shown.</div>
                  </div>
                </div>

                <div className="upg-field-row">
                  <div>
                    <div className="upg-step-label">{stepOffset + 2}. Mobile number</div>
                    <div className="upg-input-wrap has-icon">
                      <span className="upg-input-icon">📞</span>
                      <input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="+256 700 123 456" />
                    </div>
                    <div className="upg-field-hint">Enter the mobile money number registered in your name.</div>
                  </div>
                  <div>
                    <div className="upg-step-label">{stepOffset + 3}. Amount</div>
                    <div className="upg-amount-box">
                      <span className="upg-amount-value">{currency} {amount}</span>
                      <span className="upg-amount-lock">🔒</span>
                    </div>
                    <div className="upg-field-hint">One-time payment (non-refundable).</div>
                  </div>
                </div>

                <div className="upg-summary">
                  <div className="upg-summary-item"><div className="label">Upgrade type</div><div className="value">{upgradeType === 'seller' ? 'Seller Upgrade' : upgradeType === 'delivery' ? 'Delivery Upgrade' : BUSINESS_ROLE_INFO[upgradeType]?.label}</div></div>
                  <div className="upg-summary-item"><div className="label">Country</div><div className="value">{countryName}</div></div>
                  <div className="upg-summary-item"><div className="label">Provider</div><div className="value">{providerName}</div></div>
                  <div className="upg-summary-item"><div className="label">Amount</div><div className="value">{currency} {amount}</div></div>
                </div>

                <label className="upg-terms">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>
                    I agree to the <a href="/legal/terms" target="_blank" rel="noreferrer">Terms &amp; Conditions</a> and confirm
                    that the mobile number provided is mine and active.
                  </span>
                </label>

                <RippleButton className="upg-cta" disabled={!canSubmit} onClick={submitUpgrade}>
                  🔒 Upgrade Now — {currency} {amount}
                </RippleButton>
                <div className="upg-cta-note">You'll be charged once — no recurring billing.</div>

                <div style={{ marginTop: 22 }}>
                  <h4 style={{ marginBottom: 10, fontSize: '0.9rem' }}>💬 Chat with the Jedida AI assistant</h4>
                  <p className="upg-field-hint" style={{ marginBottom: 10 }}>
                    We've sent the payment number to send to below, and to your notifications — ask here if anything's unclear.
                  </p>
                  <ChatPanel />
                </div>
              </>
            )}

            {phase === 'submitting' && (
              <div className="upg-status-wrap">
                <div className="upg-status-icon loading"><div className="upg-spinner" /></div>
                <h3 className="upg-status-title">Processing your payment…</h3>
                <p className="upg-status-body">Sending your {currency} {amount} request to {providerName}. Please don't close this page.</p>
              </div>
            )}

            {phase === 'tracking' && upgrade && (
              <StatusTracker
                upgrade={upgrade}
                onKycFront={setIdFront} onKycBack={setIdBack} onKycSelfie={setSelfie}
                idFront={idFront} idBack={idBack} selfie={selfie}
                kycBusy={kycBusy} submitKyc={submitKyc}
                companyAddress={companyAddress} onCompanyAddress={setCompanyAddress}
                website={website} onWebsite={setWebsite}
                businessDocUrl={businessDocUrl} businessDocName={businessDocName}
                onBusinessDoc={(m) => { setBusinessDocUrl(m.url); setBusinessDocName(m.original_name || ''); }}
                businessVerifyBusy={businessVerifyBusy} submitBusinessVerification={submitBusinessVerification}
                onGoToDashboard={() => navigate(upgrade.requested_role === 'delivery' ? '/delivery' : '/seller')}
                onStartOver={() => { setPhase('form'); setUpgrade(null); setError(''); }}
              />
            )}

            {phase === 'tracking' && upgrade && upgrade.status !== 'approved' && (
              <div style={{ marginTop: 22 }}>
                <h4 style={{ marginBottom: 10, fontSize: '0.9rem' }}>Message the admin team</h4>
                <ChatPanel />
              </div>
            )}
          </div>

          <div className="upg-divider" />

          {/* ============ RIGHT: payment card + benefits ============ */}
          <div>
            <div className="upg-pay-card">
              <div className="upg-pay-card-top">
                <span className="upg-pay-card-brand">JEDIDA PAY</span>
                <div className="upg-pay-card-chip" />
              </div>
              <div className="upg-pay-card-number">•••• •••• •••• {mobileNumber ? mobileNumber.slice(-4) : '••••'}</div>
              <div className="upg-pay-card-bottom">
                <span>{providerName}</span>
                <span>{currency} {amount}</span>
              </div>
            </div>

            <div className="upg-glass-card">
              <h3 style={{ marginTop: 0, marginBottom: 4, fontFamily: 'var(--font-display)' }}>✅ What you'll unlock</h3>
              <div className="upg-benefits-list">
                {BENEFITS.map((b) => (
                  <div className="upg-benefit-row" key={b.title}>
                    <div className="upg-benefit-icon">{b.icon}</div>
                    <div><h5>{b.title}</h5><p>{b.body}</p></div>
                  </div>
                ))}
              </div>
              <div className="upg-gift-note">🎁 …and many more premium tools!</div>
            </div>
          </div>
        </div>

        {/* ============ Comparison table ============ */}
        <div className="upg-compare-wrap">
          <h3 className="upg-compare-title">Compare Plans</h3>
          <p className="upg-compare-sub">See exactly what changes when you upgrade.</p>

          <div className="upg-compare-grid">
            <div className="upg-compare-head free">Features</div>
            <div className="upg-compare-head free" style={{ textAlign: 'center' }}>Free Account</div>
            <div className="upg-compare-head pro" style={{ textAlign: 'center' }}>
              <span className="upg-compare-badge">One-time upgrade</span>
              Upgraded Account
            </div>

            {COMPARE_ROWS.map((row) => (
              <div className="upg-compare-row" key={row.label}>
                <div className="feature">{row.label}</div>
                <div style={{ textAlign: 'center' }}>
                  {row.free === false ? <span className="no">✕ Not available</span> : row.free}
                </div>
                <div className="pro-cell yes" style={{ textAlign: 'center' }}>✓ {row.pro}</div>
              </div>
            ))}
          </div>

          <div className="upg-trust-strip">
            <div className="upg-trust-item"><span className="ic">🔒</span><div><h5>Secure Payment</h5><p>Protected with 256-bit encryption</p></div></div>
            <div className="upg-trust-item"><span className="ic">🛂</span><div><h5>Admin Verified</h5><p>Payments verified by our team</p></div></div>
            <div className="upg-trust-item"><span className="ic">✅</span><div><h5>Safe &amp; Trusted</h5><p>Thousands of sellers trust Jedida</p></div></div>
            <div className="upg-trust-item"><span className="ic">♻️</span><div><h5>One-time Payment</h5><p>Pay once, enjoy lifetime benefits</p></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Post-submit status tracker: Loading → Payment Submitted →
// Waiting for Admin Verification → (seller: KYC) → Upgrade Approved.
// ============================================================
function StatusTracker({
  upgrade, onGoToDashboard, onStartOver, idFront, idBack, selfie, onKycFront, onKycBack, onKycSelfie, kycBusy, submitKyc,
  companyAddress, onCompanyAddress, website, onWebsite, businessDocUrl, businessDocName, onBusinessDoc, businessVerifyBusy, submitBusinessVerification
}) {
  const stage = stageForStatus(upgrade.status);
  const isSeller = upgrade.requested_role === 'seller';
  const isBusinessRole = Object.prototype.hasOwnProperty.call(BUSINESS_ROLE_INFO, upgrade.requested_role);
  const needsDocs = ROLES_REQUIRING_VERIFICATION_DOCS.includes(upgrade.requested_role);
  const roleLabel = isSeller ? 'seller' : isBusinessRole ? upgrade.requested_role : 'delivery';

  const content = {
    payment_submitted: {
      icon: 'pending', emoji: '⏳', title: 'Payment Submitted',
      body: 'We\'ve received your mobile money payment details. Waiting for admin verification — this usually takes just a few minutes.'
    },
    pending_payment: {
      icon: 'pending', emoji: '⏳', title: 'Payment Submitted',
      body: 'Waiting for admin verification — this usually takes just a few minutes.'
    },
    payment_rejected: {
      icon: 'error', emoji: '⚠️', title: 'Payment Could Not Be Verified',
      body: 'Please message the admin team below, or start a new upgrade request.'
    },
    payment_verified: isSeller
      ? { icon: 'success', emoji: '🪪', title: 'Payment Verified', body: 'Last step — verify your identity to complete your seller upgrade.' }
      : (isBusinessRole && needsDocs)
        ? { icon: 'success', emoji: '🏢', title: 'Payment Verified', body: 'Last step — verify your business to complete your ' + roleLabel + ' upgrade.' }
        : { icon: 'pending', emoji: '⏳', title: 'Waiting for Final Approval', body: `Your payment is verified. An admin will approve your ${roleLabel} upgrade shortly.` },
    kyc_pending: {
      icon: 'pending', emoji: '⏳', title: 'Waiting for Admin Verification',
      body: isBusinessRole ? 'Your business details and documents were submitted and are being reviewed.' : 'Your identity documents were submitted and are being reviewed.'
    },
    kyc_rejected: {
      icon: 'error', emoji: '⚠️', title: isBusinessRole ? 'Business Verification Rejected' : 'Identity Verification Rejected',
      body: 'Please message the admin team below for details, or start a new upgrade request.'
    },
    kyc_verified: {
      icon: 'pending', emoji: '⏳', title: 'Waiting for Final Approval',
      body: isBusinessRole ? 'Your business is verified. Final admin approval is in progress.' : 'Your identity is verified. Final admin approval is in progress.'
    },
    approved: {
      icon: 'success', emoji: '🎉', title: 'Upgrade Approved!',
      body: `Welcome aboard — your ${roleLabel} account is now active.`
    },
    rejected: {
      icon: 'error', emoji: '⚠️', title: 'Application Rejected',
      body: 'Please message the admin team below for details, or start a new upgrade request.'
    }
  }[upgrade.status] || { icon: 'pending', emoji: '⏳', title: 'Processing…', body: 'Please wait.' };

  const isTerminalError = ['payment_rejected', 'kyc_rejected', 'rejected'].includes(upgrade.status);

  return (
    <div className="upg-status-wrap">
      <div className={`upg-status-icon ${content.icon}`}>{content.icon === 'loading' ? <div className="upg-spinner" /> : content.emoji}</div>
      <h3 className="upg-status-title">{content.title}</h3>
      <p className="upg-status-body">{content.body}</p>

      <div className="upg-tracker">
        {STAGES.map((_, i) => (
          <div key={i} className={`seg ${i < stage ? 'done' : ''} ${i === stage && !isTerminalError ? 'current' : ''} ${i === stage && isTerminalError ? 'done' : ''}`} />
        ))}
      </div>

      {upgrade.status === 'payment_verified' && isSeller && (
        <form onSubmit={submitKyc} style={{ textAlign: 'left', marginTop: 22 }}>
          <div className="upg-step-label">Identity verification</div>
          <div className="field-group">
            <label>National ID — front</label>
            <MediaUploader label="🪪 Upload ID front" accept="image/*" onUploaded={(m) => onKycFront(m.url)} />
            {idFront && <p className="product-card-meta">✔ Attached</p>}
          </div>
          <div className="field-group">
            <label>National ID — back</label>
            <MediaUploader label="🪪 Upload ID back" accept="image/*" onUploaded={(m) => onKycBack(m.url)} />
            {idBack && <p className="product-card-meta">✔ Attached</p>}
          </div>
          <div className="field-group">
            <label>Selfie holding your ID (optional but recommended)</label>
            <MediaUploader label="🤳 Upload selfie" accept="image/*" onUploaded={(m) => onKycSelfie(m.url)} />
            {selfie && <p className="product-card-meta">✔ Attached</p>}
          </div>
          <button className="btn-primary" disabled={kycBusy || !idFront || !idBack}>{kycBusy ? 'Submitting…' : 'Submit KYC documents'}</button>
        </form>
      )}

      {upgrade.status === 'payment_verified' && isBusinessRole && needsDocs && (
        <form onSubmit={submitBusinessVerification} style={{ textAlign: 'left', marginTop: 22 }}>
          <div className="upg-step-label">Business verification</div>
          <div className="field-group">
            <label>Registered business address</label>
            <input value={companyAddress} onChange={(e) => onCompanyAddress(e.target.value)} placeholder="Street, city, country" />
          </div>
          <div className="field-group">
            <label>Website (optional)</label>
            <input value={website} onChange={(e) => onWebsite(e.target.value)} placeholder="https://" />
          </div>
          <div className="field-group">
            <label>Business license or certificate of incorporation</label>
            <MediaUploader label="📄 Upload document" accept="image/*,application/pdf" onUploaded={onBusinessDoc} />
            {businessDocUrl && <p className="product-card-meta">✔ Attached{businessDocName ? `: ${businessDocName}` : ''}</p>}
          </div>
          <button className="btn-primary" disabled={businessVerifyBusy || !companyAddress.trim() || !businessDocUrl}>
            {businessVerifyBusy ? 'Submitting…' : 'Submit business verification'}
          </button>
        </form>
      )}

      {upgrade.status === 'approved' && (
        <RippleButton className="upg-cta" style={{ marginTop: 20 }} onClick={onGoToDashboard}>
          Go to my {roleLabel} dashboard →
        </RippleButton>
      )}

      {isTerminalError && (
        <button className="btn-secondary" style={{ marginTop: 20 }} onClick={onStartOver}>Start a new upgrade request</button>
      )}
    </div>
  );
}
