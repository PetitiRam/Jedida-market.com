import { useState } from 'react';

const LANGUAGES = ['English', 'Luganda', 'Swahili', 'French', 'Arabic'];

export default function StepAccount({ data, onNext, onIsBusinessChange }) {
  const [form, setForm] = useState({
    full_name: data.full_name || '',
    email: data.email || '',
    phone: data.phone || '',
    date_of_birth: data.date_of_birth || '',
    gender: data.gender || '',
    nationality: data.nationality || '',
    country: data.country || '',
    district: data.district || '',
    address: data.address || '',
    preferred_language: data.preferred_language || 'English',
    is_business: data.is_business || false,
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Full name is required.';
    if (!form.email.trim()) e.email = 'Email is required.';
    if (!form.phone.trim()) e.phone = 'Phone number is required.';
    if (!form.date_of_birth) e.date_of_birth = 'Date of birth is required.';
    if (!form.nationality.trim()) e.nationality = 'Nationality is required.';
    if (!form.country.trim()) e.country = 'Country is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (validate()) {
      onIsBusinessChange?.(form.is_business);
      onNext(form);
    }
  };

  return (
    <div className="kyc-step-card">
      <div className="kyc-step-title">
        <h2>Account Information</h2>
        <p>Let's start with some basic information about you.</p>
      </div>

      <div className="kyc-form-grid">
        <Field label="Full Name" required error={errors.full_name}>
          <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="e.g. Collin K." />
        </Field>
        <Field label="Email Address" required error={errors.email}>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Phone Number" required error={errors.phone}>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+256 700 123456" />
        </Field>
        <Field label="Date of Birth" required error={errors.date_of_birth}>
          <input type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
        </Field>
        <Field label="Gender (Optional)">
          <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Nationality" required error={errors.nationality}>
          <input value={form.nationality} onChange={(e) => set('nationality', e.target.value)} placeholder="e.g. Ugandan" />
        </Field>
        <Field label="Country" required error={errors.country}>
          <input value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="e.g. Uganda" />
        </Field>
        <Field label="District">
          <input value={form.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Kampala" />
        </Field>
        <Field label="Physical Address" full>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, city" />
        </Field>
        <Field label="Preferred Language">
          <select value={form.preferred_language} onChange={(e) => set('preferred_language', e.target.value)}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
      </div>

      <label className="kyc-checkbox-row">
        <input type="checkbox" checked={form.is_business} onChange={(e) => set('is_business', e.target.checked)} />
        I'm verifying a business, manufacturer, or supplier account
      </label>

      <div className="kyc-step-actions">
        <div />
        <button type="button" className="btn-primary" onClick={handleContinue}>Continue →</button>
      </div>
    </div>
  );
}

function Field({ label, required, error, full, children }) {
  return (
    <div className={`kyc-field ${full ? 'full' : ''}`}>
      <label>{label}{required && <span className="required-mark"> *</span>}</label>
      {children}
      {error && <span className="kyc-field-error">{error}</span>}
    </div>
  );
}
