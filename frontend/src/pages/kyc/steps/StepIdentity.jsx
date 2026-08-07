import { useState } from 'react';
import client from '../../../api/client';

// Basic format checks only — actual ID-number validation rules vary by
// country/issuer, so these are permissive sanity checks, not authoritative
// validators. Update per the ID formats you actually accept.
function isPlausibleNationalId(v) {
  return /^[A-Z0-9]{8,20}$/i.test(v.trim());
}

export default function StepIdentity({ data, onNext, onBack }) {
  const [form, setForm] = useState({
    national_id_number: data.national_id_number || '',
    passport_number: data.passport_number || '',
    driving_permit_number: data.driving_permit_number || '',
    tin_number: data.tin_number || '',
  });
  const [errors, setErrors] = useState({});
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const checkDuplicate = async (idNumber) => {
    if (!idNumber || !isPlausibleNationalId(idNumber)) return;
    setCheckingDuplicate(true);
    setDuplicateWarning('');
    try {
      // Expects a lightweight backend check — see
      // GET /kyc/check-duplicate?nationalId=... (implement server-side
      // against the national_id_number index added in the phase54
      // migration). Not wired to a specific endpoint here since it depends
      // on your auth/rate-limiting setup; treat this as the integration
      // point rather than a finished duplicate-detection engine.
      const { data: res } = await client.get('/kyc/check-duplicate', { params: { nationalId: idNumber } });
      if (res.duplicate) setDuplicateWarning('This ID number is already associated with another account.');
    } catch {
      // Endpoint may not exist yet in your backend — fail silently rather
      // than block the user on a check that isn't implemented.
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.national_id_number.trim()) e.national_id_number = 'National ID number is required.';
    else if (!isPlausibleNationalId(form.national_id_number)) e.national_id_number = 'That doesn\'t look like a valid ID number.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (validate() && !duplicateWarning) onNext(form);
  };

  return (
    <div className="kyc-step-card">
      <div className="kyc-step-title">
        <h2>Identity Information</h2>
        <p>We use this to verify your identity and prevent fraud.</p>
      </div>

      <div className="kyc-form-grid">
        <Field label="National ID Number" required error={errors.national_id_number}>
          <input
            value={form.national_id_number}
            onChange={(e) => set('national_id_number', e.target.value.toUpperCase())}
            onBlur={(e) => checkDuplicate(e.target.value)}
            placeholder="e.g. CM12345678ABC"
          />
          {checkingDuplicate && <span className="kyc-field-hint">Checking…</span>}
        </Field>
        <Field label="Passport Number (Optional)">
          <input value={form.passport_number} onChange={(e) => set('passport_number', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Driving Permit Number (Optional)">
          <input value={form.driving_permit_number} onChange={(e) => set('driving_permit_number', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Tax Identification Number (Optional)">
          <input value={form.tin_number} onChange={(e) => set('tin_number', e.target.value.toUpperCase())} />
        </Field>
      </div>

      {duplicateWarning && <div className="alert alert-error">{duplicateWarning}</div>}

      <div className="kyc-step-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
        <button type="button" className="btn-primary" onClick={handleContinue}>Continue →</button>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div className="kyc-field">
      <label>{label}{required && <span className="required-mark"> *</span>}</label>
      {children}
      {error && <span className="kyc-field-error">{error}</span>}
    </div>
  );
}
