import { query } from '../config/db.js';
import { logSecurityEvent } from './securityLogService.js';

let cache = null;
let cacheAt = 0;
const CACHE_MS = 10_000;

export async function getFaceVerificationConfig() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  const { rows } = await query('SELECT * FROM face_verification_config WHERE id = 1');
  cache = rows[0];
  cacheAt = now;
  return cache;
}

export function invalidateFaceVerificationConfigCache() {
  cache = null;
}

export async function updateFaceVerificationConfig(patch, updatedBy) {
  const sets = [];
  const values = [];
  let i = 1;
  if (patch.provider !== undefined) {
    if (!['none', 'aws_rekognition'].includes(patch.provider)) {
      throw Object.assign(new Error('Unknown provider'), { statusCode: 400 });
    }
    sets.push(`provider = $${i}`); values.push(patch.provider); i += 1;
  }
  if (patch.matchThreshold !== undefined) {
    const threshold = Math.min(Math.max(Number(patch.matchThreshold), 70), 99.9);
    sets.push(`match_threshold = $${i}`); values.push(threshold); i += 1;
  }
  if (patch.enabled !== undefined) {
    sets.push(`enabled = $${i}`); values.push(Boolean(patch.enabled)); i += 1;
  }
  if (sets.length === 0) return getFaceVerificationConfig();
  sets.push(`updated_by = $${i}`, `updated_at = now()`);
  values.push(updatedBy || 'admin');
  const result = await query(`UPDATE face_verification_config SET ${sets.join(', ')} WHERE id = 1 RETURNING *`, values);
  invalidateFaceVerificationConfigCache();
  return result.rows[0];
}

// The user's face-of-record: the selfie from their most recently
// *approved* KYC submission. A rejected or still-pending submission's
// selfie is never used as a trusted reference.
async function getReferenceSelfieUrl(userId) {
  const { rows } = await query(
    `SELECT id, selfie_url FROM kyc_submissions
     WHERE user_id = $1 AND status = 'approved' AND selfie_url IS NOT NULL
     ORDER BY reviewed_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// Real provider integration, loaded lazily and only if configured — the
// AWS SDK is an optional dependency here (see package.json comment). If
// it isn't installed or credentials aren't set, this throws and the
// caller treats that identically to "not configured": fail closed, never
// silently pass.
async function compareFacesAwsRekognition(referenceImageUrl, capturedImageBase64) {
  const { RekognitionClient, CompareFacesCommand } = await import('@aws-sdk/client-rekognition');
  const client = new RekognitionClient({ region: process.env.AWS_REGION });

  const referenceResponse = await fetch(referenceImageUrl);
  if (!referenceResponse.ok) throw new Error('Could not fetch reference selfie image');
  const referenceBytes = Buffer.from(await referenceResponse.arrayBuffer());
  const capturedBytes = Buffer.from(capturedImageBase64, 'base64');

  const result = await client.send(new CompareFacesCommand({
    SourceImage: { Bytes: referenceBytes },
    TargetImage: { Bytes: capturedBytes },
    SimilarityThreshold: 0, // we apply our own configured threshold below, not Rekognition's
  }));

  const bestMatch = (result.FaceMatches || []).sort((a, b) => (b.Similarity || 0) - (a.Similarity || 0))[0];
  return { confidence: bestMatch?.Similarity ?? 0 };
}

// The one entry point everything else calls. Always writes an attempt
// row (pass or fail) and a security-log entry — see phase72's
// append-only trigger on face_verification_attempts.
export async function verifyFace({ userId, actionType, capturedImageBase64, ip }) {
  const config = await getFaceVerificationConfig();
  const record = async (fields) => {
    await query(
      `INSERT INTO face_verification_attempts (user_id, action_type, reference_source, provider, matched, confidence, reject_reason, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, actionType, fields.referenceSource || null, config.provider, fields.matched, fields.confidence ?? null, fields.rejectReason || null, ip || null]
    );
    await logSecurityEvent(null, {
      actorId: userId, actorRole: null, eventType: fields.matched ? 'face_verification_passed' : 'face_verification_failed',
      entityType: 'user', entityId: userId,
      metadata: { actionType, confidence: fields.confidence ?? null, rejectReason: fields.rejectReason || null, ip },
    });
  };

  if (!config.enabled || config.provider === 'none') {
    await record({ matched: false, rejectReason: 'not_configured' });
    return { passed: false, rejectReason: 'not_configured', message: 'Face verification is required for this action but is not yet configured on this platform. Please contact support.' };
  }

  if (!capturedImageBase64) {
    await record({ matched: false, rejectReason: 'no_capture_provided' });
    return { passed: false, rejectReason: 'no_capture_provided', message: 'A live face capture is required to continue.' };
  }

  const reference = await getReferenceSelfieUrl(userId);
  if (!reference) {
    await record({ matched: false, rejectReason: 'no_reference_selfie' });
    return { passed: false, rejectReason: 'no_reference_selfie', message: 'Complete identity verification (KYC) before performing this action.' };
  }

  try {
    let matchResult;
    if (config.provider === 'aws_rekognition') {
      matchResult = await compareFacesAwsRekognition(reference.selfie_url, capturedImageBase64);
    } else {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }

    const passed = matchResult.confidence >= Number(config.match_threshold);
    await record({
      matched: passed, confidence: matchResult.confidence, referenceSource: reference.id,
      rejectReason: passed ? null : 'below_threshold',
    });
    if (!passed) {
      return { passed: false, rejectReason: 'below_threshold', message: 'Face verification did not match closely enough. Please try again in good lighting, facing the camera directly.' };
    }
    return { passed: true, confidence: matchResult.confidence };
  } catch (err) {
    console.error('Face verification provider error:', err.message);
    await record({ matched: false, referenceSource: reference.id, rejectReason: 'provider_error' });
    // Fail closed — a broken integration must never be treated as a pass.
    return { passed: false, rejectReason: 'provider_error', message: 'Face verification could not be completed right now. Please try again shortly.' };
  }
}
