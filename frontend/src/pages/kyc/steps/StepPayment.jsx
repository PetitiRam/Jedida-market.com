import { useState } from 'react';
import PaymentMethodPicker from '../../../components/PaymentMethodSelector';

// Format sanity-checks only, not carrier validation.
function isPlausiblePhone(v) { return /^\+?\d{9,13}$/.test(v.replace(/\s/g, '')); }

export default function StepPayment({ data, onNext, onBack }) {
  const [method, setMethod] = useState(data.method || 'mtn_mobile_money');
  const [form, setForm] = useState({
    mobile_number: data.mobile_number || '',
    account_name: data.account_name || '',
    account_number: data.account_number || '',
    bank_name: data.bank_name || '',
    branch: data.branch || '',
    swift_code: data.swift_code || '',
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isMobileMoney = method === 'mtn_mobile_money' || method === 'airtel_money';
  const isBank = method === 'bank';

  const validate = () => {
    const e = {};
    if (isMobileMoney) {
      if (!form.mobile_number.trim()) e.mobile_number = 'Mobile money number is required.';
      else if (!isPlausiblePhone(form.mobile_number)) e.mobile_number = 'Enter a valid phone number.';
      if (!form.account_name.trim()) e.account_name = 'Account name is required.';
    }
    if (isBank) {
      if (!form.account_name.trim()) e.account_name = 'Account name is required.';
      if (!form.account_number.trim()) e.account_number = 'Account number is required.';
      if (!form.bank_name.trim()) e.bank_name = 'Bank name is required.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (!isMobileMoney && !isBank) {
      onNext({ method, skipped: true });
      return;
    }
    if (validate()) onNext({ method, ...form });
  };

  const handleSkip = () => onNext({ skipped: true });

  return (
    <div className="kyc-step-card">
      <div className="kyc-step-title">
        <h2>Payment Information</h2>
        <p>Add how you'd like to receive payouts. You can add or change this later in your wallet settings.</p>
      </div>

      <PaymentMethodPicker value={method} onChange={setMethod} />

      {isMobileMoney && (
        <div className="kyc-form-grid" style={{ marginTop: 20 }}>
          <Field label="Mobile Money Number" required error={errors.mobile_number}>
            <input value={form.mobile_number} onChange={(e) => set('mobile_number', e.target.value)} placeholder="+256 700 123456" />
          </Field>
          <Field label="Account Name" required error={errors.account_name}>
            <input value={form.account_name} onChange={(e) => set('account_name', e.target.value)} placeholder="Name on the mobile money account" />
          </Field>
        </div>
      )}

      {isBank && (
        <div className="kyc-form-grid" style={{ marginTop: 20 }}>
          <Field label="Account Name" required error={errors.account_name}>
            <input value={form.account_name} onChange={(e) => set('account_name', e.target.value)} />
          </Field>
          <Field label="Account Number" required error={errors.account_number}>
            <input value={form.account_number} onChange={(e) => set('account_number', e.target.value)} />
          </Field>
          <Field label="Bank Name" required error={errors.bank_name}>
            <input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
          </Field>
          <Field label="Branch">
            <input value={form.branch} onChange={(e) => set('branch', e.target.value)} />
          </Field>
          <Field label="Swift Code (Optional)">
            <input value={form.swift_code} onChange={(e) => set('swift_code', e.target.value)} />
          </Field>
        </div>
      )}

      {(isMobileMoney || isBank) && (
        <p className="kyc-ocr-note" style={{ marginTop: 16 }}>
          We can't automatically confirm you own this account yet — that needs a connected mobile
          money/bank API. For now these details are saved for an admin to confirm manually before
          your first payout, same as any other pending verification.
        </p>
      )}

      <div className="kyc-step-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={handleSkip}>Skip for now</button>
          <button type="button" className="btn-primary" onClick={handleContinue}>Continue →</button>
        </div>
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
