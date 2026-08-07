import { useState } from 'react';
import DocumentUploadCard from '../../../components/kyc/DocumentUploadCard';

const CATEGORIES = ['Retail', 'Manufacturing', 'Agriculture', 'Hospitality', 'Services', 'Wholesale/Distribution', 'Other'];

export default function StepBusiness({ data, onNext, onBack }) {
  const [form, setForm] = useState({
    business_name: data.business_name || '',
    registration_number: data.registration_number || '',
    tin: data.tin || '',
    address: data.address || '',
    category: data.category || CATEGORIES[0],
    documents: data.documents || {},
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setDoc = (key) => ({ document }) => setForm((f) => ({ ...f, documents: { ...f.documents, [key]: document } }));

  const validate = () => {
    const e = {};
    if (!form.business_name.trim()) e.business_name = 'Business name is required.';
    if (!form.registration_number.trim()) e.registration_number = 'Registration number is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (validate()) onNext(form);
  };

  return (
    <div className="kyc-step-card">
      <div className="kyc-step-title">
        <h2>Business Verification</h2>
        <p>Provide your business details and documents.</p>
      </div>

      <div className="kyc-form-grid">
        <Field label="Business Name" required error={errors.business_name}>
          <input value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
        </Field>
        <Field label="Registration Number" required error={errors.registration_number}>
          <input value={form.registration_number} onChange={(e) => set('registration_number', e.target.value)} />
        </Field>
        <Field label="Tax Identification Number (Optional)">
          <input value={form.tin} onChange={(e) => set('tin', e.target.value)} />
        </Field>
        <Field label="Business Category">
          <select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Business Address" full>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>

      <div className="kyc-doc-grid">
        <DocumentUploadCard label="Trading License" initialDoc={form.documents.trading_license} onExtracted={setDoc('trading_license')} />
        <DocumentUploadCard label="Certificate of Incorporation" initialDoc={form.documents.incorporation_cert} onExtracted={setDoc('incorporation_cert')} />
        <DocumentUploadCard label="Tax Certificate" initialDoc={form.documents.tax_cert} onExtracted={setDoc('tax_cert')} />
      </div>

      <div className="kyc-step-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
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
