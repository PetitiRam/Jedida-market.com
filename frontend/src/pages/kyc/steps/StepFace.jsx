import { useState } from 'react';
import FaceCaptureCamera from '../../../components/kyc/FaceCaptureCamera';

export default function StepFace({ data, onNext, onBack }) {
  const [result, setResult] = useState(data?.selfieUrl ? data : null);

  return (
    <div className="kyc-step-card">
      <div className="kyc-step-title">
        <h2>Face Verification</h2>
        <p>Take a live selfie so we can match it to your ID.</p>
      </div>

      {result ? (
        <div className="kyc-face-done">
          <img src={result.selfieUrl} alt="Your selfie" className="kyc-face-preview" />
          <ul className="kyc-check-list">
            <li className="ok">✓ Face detected</li>
            <li className="ok">✓ Liveness check completed</li>
            <li className="ok">✓ Photo captured</li>
          </ul>
          <button type="button" className="btn-secondary" onClick={() => setResult(null)}>Retake photo</button>
        </div>
      ) : (
        <FaceCaptureCamera onCaptured={setResult} />
      )}

      <div className="kyc-step-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
        <button type="button" className="btn-primary" disabled={!result} onClick={() => onNext(result)}>Continue →</button>
      </div>
    </div>
  );
}
