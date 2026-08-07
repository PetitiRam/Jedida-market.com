import { useState } from 'react';
import DocumentUploadCard from '../../../components/kyc/DocumentUploadCard';
import { fieldsDisagree } from '../../../utils/ocr';

const DOC_TYPES = [
  { key: 'national_id_front', label: 'National ID (Front)', required: true },
  { key: 'national_id_back', label: 'National ID (Back)', required: true },
  { key: 'passport', label: 'Passport (Optional)', required: false },
  { key: 'driving_permit', label: 'Driving Permit (Optional)', required: false },
];

export default function StepDocuments({ data, allData, onNext, onBack }) {
  const [documents, setDocuments] = useState(data || {});
  const [ocrByDoc, setOcrByDoc] = useState({});
  const [error, setError] = useState('');

  const handleExtracted = (docKey) => ({ document, extracted }) => {
    setDocuments((prev) => ({ ...prev, [docKey]: document }));
    if (extracted) setOcrByDoc((prev) => ({ ...prev, [docKey]: extracted }));
  };

  const handleContinue = () => {
    if (!documents.national_id_front || !documents.national_id_back) {
      setError('National ID front and back are required.');
      return;
    }
    onNext(documents);
  };

  const frontOcr = ocrByDoc.national_id_front;
  const accountName = allData?.account?.full_name;
  const nameMismatch = frontOcr?.fullName && accountName && fieldsDisagree(frontOcr.fullName, accountName);
  const idMismatch = frontOcr?.idNumberGuess && allData?.identity?.national_id_number
    && fieldsDisagree(frontOcr.idNumberGuess, allData.identity.national_id_number);

  return (
    <div className="kyc-step-card">
      <div className="kyc-step-title">
        <h2>Identity Documents</h2>
        <p>Upload clear images of your identity documents.</p>
      </div>

      <div className="kyc-doc-grid">
        {DOC_TYPES.map((d) => (
          <DocumentUploadCard
            key={d.key}
            label={d.label}
            required={d.required}
            initialDoc={documents[d.key]}
            onExtracted={handleExtracted(d.key)}
          />
        ))}
      </div>

      {frontOcr && (
        <div className="kyc-ocr-summary">
          <h4>Detected from your ID (please confirm)</h4>
          <ul>
            <li>Name: {frontOcr.fullName || '—'} {nameMismatch && <span className="kyc-mismatch">⚠ doesn't match what you entered</span>}</li>
            <li>ID number: {frontOcr.idNumberGuess || '—'} {idMismatch && <span className="kyc-mismatch">⚠ doesn't match what you entered</span>}</li>
            <li>Country: {frontOcr.country || '—'}</li>
            <li>Date of birth (guess): {frontOcr.dateOfBirthGuess || '—'}</li>
          </ul>
          <p className="kyc-ocr-note">
            This is read automatically from your document and may not be perfectly accurate — an admin will confirm it during review.
          </p>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="kyc-step-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
        <button type="button" className="btn-primary" onClick={handleContinue}>Continue →</button>
      </div>
    </div>
  );
}
