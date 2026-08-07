// Real, in-browser face detection using face-api.js (TensorFlow.js under
// the hood). This genuinely detects face count, position, eye landmarks,
// and frame brightness/sharpness from the live camera feed — it is not
// simulated.
//
// IMPORTANT — what this is NOT:
// This is a heuristic quality/liveness signal (useful for guiding the user
// to a good capture and catching obvious problems), not a certified
// anti-spoofing or deepfake-detection system. A determined attacker with a
// good printed photo, video replay, or synthetic face can defeat
// landmark-based blink/turn checks. Do not treat `livenessScore` or
// `passed` from this module as sufficient grounds to auto-approve identity
// or to gate a financial transaction (withdrawal, payout, etc.) on its own.
// For that, integrate a vendor anti-spoofing/liveness API (e.g. AWS
// Rekognition Liveness, Onfido, iProov, FaceTec) or a properly trained and
// evaluated in-house model — see docs/KYC_INTEGRATION.md.
//
// Model files are NOT bundled here (they're a few MB of weights). Download
// the tiny_face_detector + face_landmark_68 + face_recognition weights from
// https://github.com/justadudewhohacks/face-api.js/tree/master/weights
// and place them in /public/models, matching MODEL_URL below.

import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';
let modelsLoaded = false;
let loadingPromise = null;

export function loadFaceModels() {
  if (modelsLoaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  ]).then(() => {
    modelsLoaded = true;
  });
  return loadingPromise;
}

export function areModelsLoaded() {
  return modelsLoaded;
}

// Eye Aspect Ratio — standard landmark-based blink heuristic.
function eyeAspectRatio(eye) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vertical1 = dist(eye[1], eye[5]);
  const vertical2 = dist(eye[2], eye[4]);
  const horizontal = dist(eye[0], eye[3]);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2 * horizontal);
}

// Samples pixel data from a canvas to estimate brightness and sharpness.
// Sharpness uses a cheap Laplacian-variance-style edge estimate — real
// signal processing, run on real pixels, but a lightweight approximation
// (not a full Laplacian convolution) chosen for per-frame speed.
function analyzeBrightnessAndSharpness(canvas, box) {
  const ctx = canvas.getContext('2d');
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(canvas.width - x, Math.floor(box.width));
  const h = Math.min(canvas.height - y, Math.floor(box.height));
  if (w <= 0 || h <= 0) return { brightness: 0, sharpness: 0 };

  const { data } = ctx.getImageData(x, y, w, h);
  let sum = 0;
  let edgeSum = 0;
  const stride = 4 * 4; // sample every 4th pixel for speed
  let count = 0;
  for (let i = 0; i < data.length - stride; i += stride) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const lumNext = 0.299 * data[i + stride] + 0.587 * data[i + stride + 1] + 0.114 * data[i + stride + 2];
    sum += lum;
    edgeSum += Math.abs(lum - lumNext);
    count += 1;
  }
  if (count === 0) return { brightness: 0, sharpness: 0 };
  return {
    brightness: Math.round(sum / count), // 0-255
    sharpness: Math.round(edgeSum / count), // higher = more local contrast/edges
  };
}

// Analyzes one video frame. Returns a structured, honestly-labeled result.
export async function analyzeFrame(videoEl, canvasEl) {
  if (!modelsLoaded) {
    return { ready: false };
  }

  const detections = await faceapi
    .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
    .withFaceLandmarks();

  const canvas = canvasEl;
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  if (detections.length === 0) {
    return {
      ready: true, faceCount: 0, faceDetected: false, multipleFaces: false,
      centered: false, eyesVisible: false, brightness: 0, sharpness: 0,
    };
  }

  const primary = detections[0];
  const box = primary.detection.box;
  const landmarks = primary.landmarks;
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const nose = landmarks.getNose();

  const { brightness, sharpness } = analyzeBrightnessAndSharpness(canvas, box);

  const frameCenterX = canvas.width / 2;
  const faceCenterX = box.x + box.width / 2;
  const centered = Math.abs(faceCenterX - frameCenterX) < canvas.width * 0.15
    && box.width > canvas.width * 0.2 && box.width < canvas.width * 0.8;

  const leftEAR = eyeAspectRatio(leftEye);
  const rightEAR = eyeAspectRatio(rightEye);
  const avgEAR = (leftEAR + rightEAR) / 2;
  const eyesOpen = avgEAR > 0.18; // below this = closed/blinking
  const eyesVisible = leftEye.length > 0 && rightEye.length > 0;

  // Rough left/right turn signal from nose position relative to face box —
  // used to satisfy a "turn left / turn right" liveness challenge step.
  const noseX = nose[3]?.x ?? (box.x + box.width / 2);
  const relativeNoseX = (noseX - box.x) / box.width; // 0 = left edge, 1 = right edge
  let headTurn = 'center';
  if (relativeNoseX < 0.38) headTurn = 'right'; // mirrored camera
  else if (relativeNoseX > 0.62) headTurn = 'left';

  return {
    ready: true,
    faceCount: detections.length,
    faceDetected: true,
    multipleFaces: detections.length > 1,
    centered,
    eyesVisible,
    eyesOpen,
    earScore: Number(avgEAR.toFixed(3)),
    brightness,
    sharpness,
    headTurn,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
  };
}

// Aggregates a short buffer of frame results into a pass/fail for the
// pre-capture checklist. All thresholds are heuristic and configurable.
export function evaluateChecklist(frame) {
  if (!frame || !frame.ready) return null;
  return {
    faceDetected: frame.faceDetected,
    singleFace: frame.faceDetected && !frame.multipleFaces,
    eyesVisible: frame.eyesVisible,
    centered: frame.centered,
    brightnessOk: frame.brightness >= 60 && frame.brightness <= 210,
    sharpnessOk: frame.sharpness >= 6,
    allPassed:
      frame.faceDetected &&
      !frame.multipleFaces &&
      frame.eyesVisible &&
      frame.centered &&
      frame.brightness >= 60 && frame.brightness <= 210 &&
      frame.sharpness >= 6,
  };
}
