import { useEffect, useRef, useState, useCallback } from 'react';
import client from '../../api/client';
import { loadFaceModels, analyzeFrame, evaluateChecklist } from '../../utils/faceDetection';

const CHALLENGES = [
  { id: 'blink', label: 'Blink once' },
  { id: 'turn_left', label: 'Turn your head slightly left' },
  { id: 'turn_right', label: 'Turn your head slightly right' },
];

function pickChallenge() {
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}

const INSTRUCTIONS = [
  'Remove sunglasses, masks, and hats (unless worn for religious reasons)',
  'Look directly at the camera in good lighting',
  'Keep your full face inside the guide frame',
  'Make sure only you appear in frame',
];

export default function FaceCaptureCamera({ onCaptured }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const [stage, setStage] = useState('instructions'); // instructions | camera | challenge | captured | error
  const [modelsReady, setModelsReady] = useState(false);
  const [checklist, setChecklist] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [challengeHoldFrames, setChallengeHoldFrames] = useState(0);
  const [capturedImg, setCapturedImg] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadFaceModels().then(() => setModelsReady(true)).catch((err) => {
      console.error('Failed to load face detection models:', err);
      setError('Could not load the face-detection AI. Check your connection and try again.');
    });
  }, []);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage('camera');
    } catch (err) {
      console.error('Camera error:', err);
      setError('Could not access your camera. Please check permissions and try again.');
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Main detection loop: runs while in 'camera' or 'challenge' stage.
  useEffect(() => {
    if (!modelsReady || (stage !== 'camera' && stage !== 'challenge')) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const frame = await analyzeFrame(videoRef.current, canvasRef.current);
      const result = evaluateChecklist(frame);
      setChecklist(result);

      if (stage === 'camera' && result?.allPassed) {
        const c = pickChallenge();
        setChallenge(c);
        setChallengeHoldFrames(0);
        setStage('challenge');
      }

      if (stage === 'challenge' && frame?.ready) {
        const satisfied =
          (challenge?.id === 'blink' && !frame.eyesOpen) ||
          (challenge?.id === 'turn_left' && frame.headTurn === 'left') ||
          (challenge?.id === 'turn_right' && frame.headTurn === 'right');
        setChallengeHoldFrames((prev) => {
          const next = satisfied ? prev + 1 : Math.max(0, prev - 1);
          if (next >= 4) capture(frame); // ~4 consecutive matching frames
          return next;
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelled = true; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsReady, stage, challenge]);

  const capture = (lastFrame) => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImg(dataUrl);
    setStage('captured');
    stopCamera();
    uploadCapture(dataUrl, lastFrame);
  };

  const uploadCapture = async (dataUrl, lastFrame) => {
    setUploading(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const formData = new FormData();
      formData.append('file', blob, 'selfie.jpg');
      const { data } = await client.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // This is the honest boundary: everything above (face count,
      // centering, brightness, blink/turn) is a real, measured signal from
      // this session's camera frames. `clientCheckPassed` only means "the
      // in-browser heuristic checks passed" — it is NOT a face-match
      // against the ID document or a certified liveness/anti-spoofing
      // verdict. Real face-matching and anti-spoofing must happen with a
      // proper model/vendor on the backend before this can gate anything
      // security-sensitive (see backend/src/services/kycRiskEngine.js).
      onCaptured?.({
        selfieUrl: data.media.url,
        clientCheckPassed: true,
        challengeCompleted: challenge?.id || null,
        lastMeasuredFrame: lastFrame ? {
          brightness: lastFrame.brightness,
          sharpness: lastFrame.sharpness,
          earScore: lastFrame.earScore,
        } : null,
      });
    } catch (err) {
      console.error('Selfie upload error:', err);
      setError('Could not upload your photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const retake = () => {
    setCapturedImg(null);
    setChecklist(null);
    setChallenge(null);
    startCamera();
  };

  if (stage === 'instructions') {
    return (
      <div className="kyc-face-instructions">
        <h4>Before you begin</h4>
        <ul>
          {INSTRUCTIONS.map((line) => <li key={line}>{line}</li>)}
        </ul>
        {error && <div className="kyc-status-line kyc-status-error">{error}</div>}
        <button type="button" className="btn-primary" onClick={startCamera} disabled={!modelsReady}>
          {modelsReady ? 'Start face verification' : 'Loading AI models…'}
        </button>
      </div>
    );
  }

  if (stage === 'captured') {
    return (
      <div className="kyc-face-captured">
        <img src={capturedImg} alt="Captured selfie" className="kyc-face-preview" />
        <ul className="kyc-check-list">
          <li className="ok">✓ Face detected</li>
          <li className="ok">✓ Liveness challenge completed ({challenge?.label})</li>
        </ul>
        {uploading ? (
          <div className="kyc-status-line">Uploading…</div>
        ) : (
          <button type="button" className="btn-secondary" onClick={retake}>Retake photo</button>
        )}
      </div>
    );
  }

  return (
    <div className="kyc-face-camera">
      <div className="kyc-camera-frame">
        <video ref={videoRef} playsInline muted className="kyc-camera-video" />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className={`kyc-camera-guide ${checklist?.allPassed ? 'green' : 'yellow'}`} />
      </div>

      {stage === 'challenge' && challenge && (
        <div className="kyc-challenge-banner">👉 {challenge.label}</div>
      )}

      <ul className="kyc-check-list">
        <li className={checklist?.faceDetected ? 'ok' : ''}>{checklist?.faceDetected ? '✓' : '○'} Face detected</li>
        <li className={checklist?.singleFace ? 'ok' : ''}>{checklist?.singleFace ? '✓' : '○'} Only one face</li>
        <li className={checklist?.eyesVisible ? 'ok' : ''}>{checklist?.eyesVisible ? '✓' : '○'} Eyes visible</li>
        <li className={checklist?.centered ? 'ok' : ''}>{checklist?.centered ? '✓' : '○'} Face centered</li>
        <li className={checklist?.brightnessOk ? 'ok' : ''}>{checklist?.brightnessOk ? '✓' : '○'} Good lighting</li>
        <li className={checklist?.sharpnessOk ? 'ok' : ''}>{checklist?.sharpnessOk ? '✓' : '○'} Sharp image</li>
      </ul>

      {error && <div className="kyc-status-line kyc-status-error">{error}</div>}
    </div>
  );
}
