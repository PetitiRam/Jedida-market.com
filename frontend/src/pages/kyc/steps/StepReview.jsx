import { useState } from 'react';

export default function StepReview({ allData, onBack, onSubmit, goToStep }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { account = {}, identity = {}, documents = {}, face = {}, business = {}, payment = {} } = allData || {};

  const docCount = Object.values(documents).filter(Boolean).length;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onSubmit();
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.response?.data?.error || 'Could not submit your verification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="kyc-step-card">
      <div className="kyc-step-title">
        <h2>Review & Submit</h2>
        <p>Review your information before submitting.</p>
      </div>

      <ReviewSection title="Personal Information" onEdit={() => goToStep('account')}>
        {account.full_name}, {account.phone}
      </ReviewSection>
      <ReviewSection title="Identity Documents" onEdit={() => goToStep('documents')}>
        {docCount} document{docCount === 1 ? '' : 's'} uploaded
      </ReviewSection>
      <ReviewSection title="Face Verification" onEdit={() => goToStep('face')}>
        {face.selfieUrl ? 'Selfie captured ✓' : 'Not completed'}
      </ReviewSection>
      {business?.business_name && (
        <ReviewSection title="Business Information" onEdit={() => goToStep('business')}>
          {business.business_name}
        </ReviewSection>
      )}
      <ReviewSection title="Identity" onEdit={() => goToStep('identity')}>
        National ID: {identity.national_id_number || '—'}
      </ReviewSection>
      <ReviewSection title="Payment Information" onEdit={() => goToStep('payment')}>
        {payment.skipped ? 'Not added yet' : payment.method ? `${payment.method.replace('_', ' ')} · ${payment.account_name || payment.mobile_number || ''}` : 'Not added yet'}
      </ReviewSection>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="kyc-step-actions">
        <button type="button" className="btn-secondary" onClick={onBack} disabled={submitting}>Back</button>
        <button type="button" className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit for Review'}
        </button>
      </div>
      <p className="kyc-terms-note">By submitting, you agree to our Terms & Conditions.</p>
    </div>
  );
}

function ReviewSection({ title, onEdit, children }) {
  return (
    <div className="kyc-review-row">
      <div>
        <strong>{title}</strong>
        <div className="kyc-review-detail">{children}</div>
      </div>
      <button type="button" className="btn-link" onClick={onEdit}>Edit</button>
    </div>
  );
}
