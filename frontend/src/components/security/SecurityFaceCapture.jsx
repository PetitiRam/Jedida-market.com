import { useEffect, useRef, useState } from 'react';

// Used for security-gated actions (admin refunds, large withdrawals, payout
// method changes, shop deletion) — NOT for KYC onboarding, which has its
// own FaceCaptureCamera with a liveness challenge and an upload step.
// This one just grabs a single frame and hands back base64 (no data: URL
// prefix) for the caller to send as `faceCapture` in the gated request
// body — see middleware/faceVerification.js on the backend.
export default function SecurityFaceCapture({ title, onConfirm, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [stage, setStage] = useState('starting'); // starting | camera | captured | error
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStage('camera');
      } catch (err) {
        console.error('Camera error:', err);
        setError('Could not access your camera. Please check permissions and try again.');
        setStage('error');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.92));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStage('captured');
  };

  const retake = async () => {
    setCapturedDataUrl(null);
    setStage('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage('camera');
    } catch {
      setError('Could not access your camera. Please check permissions and try again.');
      setStage('error');
    }
  };

  const confirm = () => {
    // Strip the "data:image/jpeg;base64," prefix — the backend expects raw
    // base64 in req.body.faceCapture.
    const base64 = capturedDataUrl.split(',')[1];
    onConfirm(base64);
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,24,22,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, maxWidth: 420, width: '100%',
          padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <h3 style={{ marginBottom: 6 }}>{title || 'Face verification required'}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          This action requires a live face capture to continue. Look directly at the camera in good lighting.
        </p>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        {stage !== 'captured' && (
          <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '1/1', marginBottom: 16 }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {stage === 'captured' && (
          <img src={capturedDataUrl} alt="Captured face" style={{ width: '100%', borderRadius: 12, marginBottom: 16 }} />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          {stage === 'camera' && <button className="btn-primary" onClick={capture}>Capture</button>}
          {stage === 'captured' && (
            <>
              <button className="btn-secondary" onClick={retake}>Retake</button>
              <button className="btn-primary" onClick={confirm}>Confirm &amp; continue</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
