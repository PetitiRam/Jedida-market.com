import { useEffect, useState, useCallback } from 'react';
import Logo from '../../components/Logo';
import * as kycApi from '../../api/kycApi';
import StepAccount from './steps/StepAccount';
import StepIdentity from './steps/StepIdentity';
import StepDocuments from './steps/StepDocuments';
import StepFace from './steps/StepFace';
import StepBusiness from './steps/StepBusiness';
import StepPayment from './steps/StepPayment';
import StepReview from './steps/StepReview';
import '../../styles/kyc.css';

const STEPS = [
  { key: 'account', label: 'Account Information', Component: StepAccount },
  { key: 'identity', label: 'Identity Information', Component: StepIdentity },
  { key: 'documents', label: 'Identity Documents', Component: StepDocuments },
  { key: 'face', label: 'Face Verification', Component: StepFace },
  { key: 'business', label: 'Business Verification', Component: StepBusiness },
  { key: 'payment', label: 'Payment Information', Component: StepPayment },
  { key: 'review', label: 'Review & Submit', Component: StepReview },
];

export default function KycWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [wizardData, setWizardData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [submitted, setSubmitted] = useState(null);
  const [isBusiness, setIsBusiness] = useState(false);

  useEffect(() => {
    kycApi.getDraft()
      .then(({ data }) => {
        const source = data.draft || data.latest;
        if (source) {
          setWizardData({
            account: {
              full_name: source.full_name, date_of_birth: source.date_of_birth,
              nationality: source.nationality, country: source.country, district: source.district,
            },
            identity: {
              national_id_number: source.national_id_number, passport_number: source.passport_number,
              driving_permit_number: source.driving_permit_number, tin_number: source.tin_number,
            },
            documents: source.documents || {},
            face: source.face_check || {},
            business: source.business || {},
            payment: source.payment_method || {},
          });
          setStepIndex(Math.max(0, (source.current_step || 1) - 1));
        }
        if (data.draft?.status && data.draft.status !== 'draft') setSubmitted(data.draft);
      })
      .catch((err) => console.error('Could not load saved KYC progress:', err))
      .finally(() => setLoading(false));
  }, []);

  const visibleSteps = STEPS.filter((s) => s.key !== 'business' || isBusiness);

  const persistStep = useCallback(async (stepKey, data, nextStepNumber) => {
    setSaveState('saving');
    try {
      await kycApi.saveDraftStep(stepKey, data, nextStepNumber);
      setSaveState('saved');
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (err) {
      console.error('Autosave failed:', err);
      setSaveState('error');
    }
  }, []);

  const goNext = async (stepKey, stepData) => {
    setWizardData((prev) => ({ ...prev, [stepKey]: stepData }));
    const nextIndex = Math.min(stepIndex + 1, visibleSteps.length - 1);
    await persistStep(stepKey, stepData, nextIndex + 1);
    setStepIndex(nextIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToStep = (index) => {
    if (index <= stepIndex) setStepIndex(index);
  };

  const handleFinalSubmit = async () => {
    const { data } = await kycApi.submitFull();
    setSubmitted(data.submission);
  };

  if (loading) {
    return <div className="kyc-loading">Loading your verification…</div>;
  }

  if (submitted) {
    return (
      <div className="kyc-page">
        <div className="kyc-submitted-card">
          <div className="kyc-submitted-icon">✅</div>
          <h2>Verification Submitted</h2>
          <p>Reference Number: <strong>{submitted.id}</strong></p>
          <p>Status: <strong>{submitted.status === 'manual_review' ? 'Pending manual review' : 'Pending review'}</strong></p>
          <p className="kyc-submitted-note">
            Our team typically reviews submissions within 24–48 hours. We'll notify you as soon as there's an update.
          </p>
        </div>
      </div>
    );
  }

  const current = visibleSteps[stepIndex];
  const progressPct = Math.round(((stepIndex) / (visibleSteps.length - 1)) * 100);

  return (
    <div className="kyc-page">
      <header className="kyc-header">
        <Logo size={32} />
        <div className="kyc-header-text">
          <h1>Verify Your Identity</h1>
          <p>Complete your KYC verification to start using Jedida Marketplace.</p>
        </div>
        <div className="kyc-encrypted-badge">🔒 Your data is encrypted and secure</div>
      </header>

      <div className="kyc-layout">
        <aside className="kyc-sidebar">
          <ol className="kyc-step-list">
            {visibleSteps.map((s, i) => (
              <li
                key={s.key}
                className={i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending'}
                onClick={() => goToStep(i)}
              >
                <span className="kyc-step-marker">{i < stepIndex ? '✓' : i + 1}</span>
                <span className="kyc-step-label">
                  {s.label}
                  <small>{i < stepIndex ? 'Completed' : i === stepIndex ? 'In Progress' : 'Pending'}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className="kyc-help-box">
            <strong>Need help?</strong>
            <p>Our support team is here to assist you.</p>
            <a href="/support" className="btn-secondary btn-small">Contact Support</a>
          </div>
        </aside>

        <main className="kyc-main">
          <div className="kyc-progress-bar-track">
            <div className="kyc-progress-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="kyc-step-meta">
            <span>Step {stepIndex + 1} of {visibleSteps.length}</span>
            {saveState === 'saving' && <span className="kyc-save-indicator">Saving…</span>}
            {saveState === 'saved' && <span className="kyc-save-indicator ok">Saved ✓</span>}
            {saveState === 'error' && <span className="kyc-save-indicator error">Couldn't save — will retry</span>}
          </div>

          <current.Component
            data={wizardData[current.key] || {}}
            allData={wizardData}
            onNext={(stepData) => goNext(current.key, stepData)}
            onBack={stepIndex > 0 ? goBack : null}
            onSubmit={handleFinalSubmit}
            onIsBusinessChange={setIsBusiness}
            goToStep={(key) => {
              const idx = visibleSteps.findIndex((s) => s.key === key);
              if (idx >= 0) setStepIndex(idx);
            }}
          />
        </main>
      </div>
    </div>
  );
}
