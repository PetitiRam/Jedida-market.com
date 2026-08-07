import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import Icon from '../components/icons/icon';
import FloatingInput from '../components/auth/FloatingInput';
import Checkbox from '../components/auth/Checkbox';
import AuthButton from '../components/auth/AuthButton';
import PartnerDocumentUploader from '../components/partners/PartnerDocumentUploader';
import { PARTNER_TYPES, PARTNER_DOCUMENT_TYPES } from '../constants/partnerTypes';
import { COUNTRIES } from '../constants/countries';
import { submitPartnerApplication } from '../api/partnersApi';
import '../styles/auth-v2.css';
import '../styles/partner.css';

const TRUST_POINTS = [
  { icon: 'shield', text: 'Vetted, secure partnership review' },
  { icon: 'checkShield', text: 'Backed by escrow-protected commerce' },
  { icon: 'handshake', text: 'Trusted by companies across East Africa' },
];

const initialForm = {
  companyName: '', registrationNumber: '', businessEmail: '', businessPhone: '', website: '', country: '', physicalAddress: '',
  contactFullName: '', contactPosition: '', contactEmail: '', contactPhone: '',
  partnerType: '',
  partnershipReason: '', servicesProvided: '', expectedBenefits: '',
  acceptedPartnershipTerms: false, acceptedPrivacyPolicy: false, acceptedDataProtectionPolicy: false,
};

const REQUIRED_KEYS = [
  'companyName', 'registrationNumber', 'businessEmail', 'businessPhone', 'country', 'physicalAddress',
  'contactFullName', 'contactPosition', 'contactEmail', 'contactPhone',
  'partnerType', 'partnershipReason', 'servicesProvided', 'expectedBenefits',
];

export default function PartnerWithJedida() {
  const [form, setForm] = useState(initialForm);
  const [documents, setDocuments] = useState({}); // docType -> document object
  const [errors, setErrors] = useState({});
  const [submitState, setSubmitState] = useState('idle'); // idle | loading | success
  const [submitError, setSubmitError] = useState('');
  const [reference, setReference] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const completion = useMemo(() => {
    const filled = REQUIRED_KEYS.filter((k) => String(form[k] || '').trim()).length;
    const termsFilled = [form.acceptedPartnershipTerms, form.acceptedPrivacyPolicy, form.acceptedDataProtectionPolicy].filter(Boolean).length;
    return Math.round(((filled + termsFilled) / (REQUIRED_KEYS.length + 3)) * 100);
  }, [form]);

  const validate = () => {
    const errs = {};
    for (const key of REQUIRED_KEYS) {
      if (!String(form[key] || '').trim()) errs[key] = 'Required';
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (form.businessEmail && !emailPattern.test(form.businessEmail)) errs.businessEmail = 'Enter a valid email';
    if (form.contactEmail && !emailPattern.test(form.contactEmail)) errs.contactEmail = 'Enter a valid email';
    if (!form.acceptedPartnershipTerms || !form.acceptedPrivacyPolicy || !form.acceptedDataProtectionPolicy) {
      errs.terms = 'You must accept all three policies to submit your application.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) {
      const firstErrorEl = document.querySelector('.jd-field-error, .jd-partner-terms-error');
      firstErrorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitState('loading');
    try {
      const payload = {
        ...form,
        documents: Object.values(documents).filter(Boolean),
      };
      const { data } = await submitPartnerApplication(payload);
      setReference(data.application.referenceCode);
      setSubmitState('success');
    } catch (err) {
      setSubmitState('idle');
      setSubmitError(err.response?.data?.error || 'Could not submit your application. Please try again.');
    }
  };

  if (submitState === 'success') {
    return (
      <div className="jd-partner">
        <span className="jd-partner-glow-a" />
        <span className="jd-partner-glow-b" />
        <div className="jd-partner-topbar">
          <Link to="/" aria-label="JEDIDA Marketplace home"><Logo size={30} /></Link>
          <ThemeToggle />
        </div>
        <div className="jd-partner-body" style={{ maxWidth: 560, paddingTop: 40 }}>
          <div className="jd-partner-section jd-partner-success">
            <div className="jd-partner-success-icon"><Icon name="check" size={34} /></div>
            <div className="jd-partner-success-title">Application submitted</div>
            <p className="jd-partner-success-body">
              Thank you for applying to partner with JEDIDA Marketplace. Our partnerships team will review
              your application and reach out at the business email you provided.
            </p>
            <div className="jd-partner-refcode"><Icon name="fileCheck" size={16} /> {reference}</div>
            <div>
              <Link to="/marketplace"><button type="button" className="jd-btn-primary" style={{ width: 'auto', padding: '12px 28px' }}>Return to Marketplace</button></Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jd-partner">
      <span className="jd-partner-glow-a" />
      <span className="jd-partner-glow-b" />

      <div className="jd-partner-topbar">
        <Link to="/" aria-label="JEDIDA Marketplace home"><Logo size={30} /></Link>
        <ThemeToggle />
      </div>

      <div className="jd-partner-hero">
        <span className="jd-partner-eyebrow"><Icon name="sparkle" size={13} /> Partner Program</span>
        <h1 className="jd-partner-title">Partner With Jedida</h1>
        <p className="jd-partner-subtitle">
          Join the network of payment, delivery, technology, and financial partners powering
          JEDIDA Marketplace. Tell us about your company to begin the application.
        </p>
        <div className="jd-partner-trust-row">
          {TRUST_POINTS.map((p) => (
            <div className="jd-partner-trust-item" key={p.text}>
              <Icon name={p.icon} size={16} /> {p.text}
            </div>
          ))}
        </div>
      </div>

      <form className="jd-partner-body" onSubmit={handleSubmit} noValidate>
        <div className="jd-partner-progress-wrap">
          <div className="jd-partner-progress-track">
            <div className="jd-partner-progress-fill" style={{ width: `${completion}%` }} />
          </div>
          <span className="jd-partner-progress-label">{completion}% complete</span>
        </div>

        {submitError && (
          <div className="jd-alert jd-alert-error"><Icon name="x" size={15} /> {submitError}</div>
        )}

        {/* Company */}
        <section className="jd-partner-section">
          <div className="jd-partner-section-head">
            <span className="jd-partner-section-num">1</span>
            <div>
              <div className="jd-partner-section-title">Company Information</div>
              <div className="jd-partner-section-sub">Tell us about your organization</div>
            </div>
          </div>
          <FloatingInput id="companyName" label="Company Name" required icon="building" value={form.companyName} onChange={set('companyName')} error={errors.companyName} />
          <FloatingInput id="registrationNumber" label="Company Registration Number" required icon="fileCheck" value={form.registrationNumber} onChange={set('registrationNumber')} error={errors.registrationNumber} />
          <div className="jd-field-row">
            <FloatingInput id="businessEmail" label="Business Email" type="email" required icon="mail" value={form.businessEmail} onChange={set('businessEmail')} error={errors.businessEmail} />
            <FloatingInput id="businessPhone" label="Business Phone" type="tel" required icon="phone" value={form.businessPhone} onChange={set('businessPhone')} error={errors.businessPhone} />
          </div>
          <FloatingInput id="website" label="Website (optional)" type="url" icon="globe" value={form.website} onChange={set('website')} />
          <div className="jd-field">
            <div className="jd-field-input-wrap">
              <span className="jd-field-icon-left"><Icon name="globe" size={17} /></span>
              <select id="country" className={form.country ? 'jd-filled jd-has-icon-left' : 'jd-has-icon-left'} value={form.country} onChange={set('country')} style={{ paddingLeft: 42 }}>
                <option value="" disabled></option>
                {COUNTRIES.map((c) => <option key={c.iso2} value={c.name}>{c.flag} {c.name}</option>)}
              </select>
              <label htmlFor="country" className={`jd-field-label ${form.country ? 'jd-float' : ''}`}>Country *</label>
            </div>
            {errors.country && <div className="jd-field-error"><Icon name="x" size={13} /> Required</div>}
          </div>
          <div className="jd-field">
            <label htmlFor="physicalAddress" className="jd-field-label jd-textarea-label">Physical Address *</label>
            <textarea id="physicalAddress" value={form.physicalAddress} onChange={set('physicalAddress')} placeholder="Street, city, region, postal code" />
            {errors.physicalAddress && <div className="jd-field-error"><Icon name="x" size={13} /> Required</div>}
          </div>
        </section>

        {/* Contact person */}
        <section className="jd-partner-section">
          <div className="jd-partner-section-head">
            <span className="jd-partner-section-num">2</span>
            <div>
              <div className="jd-partner-section-title">Contact Person</div>
              <div className="jd-partner-section-sub">Who should we reach out to?</div>
            </div>
          </div>
          <FloatingInput id="contactFullName" label="Full Name" required icon="user" value={form.contactFullName} onChange={set('contactFullName')} error={errors.contactFullName} />
          <FloatingInput id="contactPosition" label="Position / Title" required icon="briefcase" value={form.contactPosition} onChange={set('contactPosition')} error={errors.contactPosition} />
          <div className="jd-field-row">
            <FloatingInput id="contactEmail" label="Email" type="email" required icon="mail" value={form.contactEmail} onChange={set('contactEmail')} error={errors.contactEmail} />
            <FloatingInput id="contactPhone" label="Phone Number" type="tel" required icon="phone" value={form.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} />
          </div>
        </section>

        {/* Partner type */}
        <section className="jd-partner-section">
          <div className="jd-partner-section-head">
            <span className="jd-partner-section-num">3</span>
            <div>
              <div className="jd-partner-section-title">Partner Type</div>
              <div className="jd-partner-section-sub">Select the category that best fits your company</div>
            </div>
          </div>
          <div className="jd-partner-type-grid">
            {PARTNER_TYPES.map(([value, label]) => (
              <div
                key={value}
                className={`jd-partner-type-card ${form.partnerType === value ? 'selected' : ''}`}
                onClick={() => setForm((f) => ({ ...f, partnerType: value }))}
                role="radio"
                aria-checked={form.partnerType === value}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setForm((f) => ({ ...f, partnerType: value })); } }}
              >
                <span className="jd-partner-type-card-icon"><Icon name={form.partnerType === value ? 'checkShield' : 'briefcase'} size={15} /></span>
                {label}
              </div>
            ))}
          </div>
          {errors.partnerType && <div className="jd-field-error" style={{ marginTop: 10 }}><Icon name="x" size={13} /> Select a partner type</div>}
        </section>

        {/* Purpose */}
        <section className="jd-partner-section">
          <div className="jd-partner-section-head">
            <span className="jd-partner-section-num">4</span>
            <div>
              <div className="jd-partner-section-title">Partnership Purpose</div>
              <div className="jd-partner-section-sub">Help us understand the fit</div>
            </div>
          </div>
          <div className="jd-field">
            <label htmlFor="partnershipReason" className="jd-field-label jd-textarea-label">Why do you want to partner with Jedida Marketplace? *</label>
            <textarea id="partnershipReason" value={form.partnershipReason} onChange={set('partnershipReason')} />
            {errors.partnershipReason && <div className="jd-field-error"><Icon name="x" size={13} /> Required</div>}
          </div>
          <div className="jd-field">
            <label htmlFor="servicesProvided" className="jd-field-label jd-textarea-label">What services do you provide? *</label>
            <textarea id="servicesProvided" value={form.servicesProvided} onChange={set('servicesProvided')} />
            {errors.servicesProvided && <div className="jd-field-error"><Icon name="x" size={13} /> Required</div>}
          </div>
          <div className="jd-field" style={{ marginBottom: 0 }}>
            <label htmlFor="expectedBenefits" className="jd-field-label jd-textarea-label">What benefits do you expect from this partnership? *</label>
            <textarea id="expectedBenefits" value={form.expectedBenefits} onChange={set('expectedBenefits')} />
            {errors.expectedBenefits && <div className="jd-field-error"><Icon name="x" size={13} /> Required</div>}
          </div>
        </section>

        {/* Documents */}
        <section className="jd-partner-section">
          <div className="jd-partner-section-head">
            <span className="jd-partner-section-num">5</span>
            <div>
              <div className="jd-partner-section-title">Document Upload</div>
              <div className="jd-partner-section-sub">PDF, DOC/DOCX, JPG, PNG, or WEBP — up to 15MB each</div>
            </div>
          </div>
          {PARTNER_DOCUMENT_TYPES.map(([docType, label, required]) => (
            <PartnerDocumentUploader
              key={docType}
              docType={docType}
              label={label}
              required={required}
              value={documents[docType] || null}
              onChange={(doc) => setDocuments((d) => ({ ...d, [docType]: doc }))}
            />
          ))}
        </section>

        {/* Terms */}
        <section className="jd-partner-section">
          <div className="jd-partner-section-head">
            <span className="jd-partner-section-num">6</span>
            <div>
              <div className="jd-partner-section-title">Terms &amp; Policies</div>
              <div className="jd-partner-section-sub">Please review and accept before submitting</div>
            </div>
          </div>
          <div className="jd-partner-terms-box">
            <Checkbox id="acceptedPartnershipTerms" checked={form.acceptedPartnershipTerms} onChange={(v) => setForm((f) => ({ ...f, acceptedPartnershipTerms: v }))}>
              I have read and accept the <Link to="/legal/partnership_terms" target="_blank" rel="noreferrer">Partnership Terms</Link>
            </Checkbox>
            <Checkbox id="acceptedPrivacyPolicy" checked={form.acceptedPrivacyPolicy} onChange={(v) => setForm((f) => ({ ...f, acceptedPrivacyPolicy: v }))}>
              I have read and accept the <Link to="/legal/privacy_policy" target="_blank" rel="noreferrer">Privacy Policy</Link>
            </Checkbox>
            <Checkbox id="acceptedDataProtectionPolicy" checked={form.acceptedDataProtectionPolicy} onChange={(v) => setForm((f) => ({ ...f, acceptedDataProtectionPolicy: v }))}>
              I have read and accept the <Link to="/legal/data_protection_policy" target="_blank" rel="noreferrer">Data Protection Policy</Link>
            </Checkbox>
          </div>
          {errors.terms && <div className="jd-field-error jd-partner-terms-error" style={{ marginTop: 10 }}><Icon name="x" size={13} /> {errors.terms}</div>}
        </section>

        <div className="jd-partner-submit-row">
          <AuthButton state={submitState === 'loading' ? 'loading' : 'idle'} loadingLabel="Submitting application…">
            Submit Application
          </AuthButton>
          <div className="jd-partner-submit-note">
            An administrator will review your application and follow up by email.
          </div>
        </div>
      </form>
    </div>
  );
}
