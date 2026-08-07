// PETITI Learning Engine — spec section 6 ("Petiti AI learns from previous
// attacks, security events, admin decisions, fraud patterns").
//
// Deliberately NOT a trained model. The honest version of "self-learning"
// this codebase can support without a labeled dataset or an ML pipeline is:
// admins already review fraud_reports and mark them 'confirmed' or
// 'dismissed' (fraud_status enum, schema_phase4) — that IS the training
// signal. This module reads that history back and turns a category's
// track record into a bounded adjustment applied to that category's future
// risk scores, so a detector that's been wrong a lot gets less trigger-
// happy over time, and one that's been right a lot keeps its full weight.
// Every adjustment is a plain, inspectable number with a reason string —
// nothing here is a black box, on purpose: an autonomous security system
// whose admins can't see *why* it's more or less cautious than last month
// is worse than one with no learning at all.

import { query } from '../../src/config/db.js';
import { log } from './petitiService.js';

const MIN_SAMPLE_SIZE = 5; // below this, there isn't enough reviewed history to trust yet
const MAX_ADJUSTMENT = 20; // caps how far learning can move a score either direction

// ---------------------------------------------------------------------------
// Admin feedback — the actual "training" step. Call these from the fraud
// report / alert review UI. Both require a reviewing admin id, same
// reasoning as petitiResponseEngine.js's admin-only reversals: PETITI can
// detect and contain on its own, but only a human closes the loop on
// whether a detection was actually right.
// ---------------------------------------------------------------------------

export async function reviewFraudReport(reportId, outcome, adminUserId) {
  if (!['confirmed', 'dismissed'].includes(outcome)) {
    throw new Error(`Invalid review outcome "${outcome}" — must be "confirmed" or "dismissed".`);
  }
  if (!adminUserId) throw new Error('reviewFraudReport requires a reviewing admin id.');
  const result = await query(
    `UPDATE fraud_reports SET status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $1 RETURNING *`,
    [reportId, outcome, adminUserId]
  );
  const report = result.rows[0];
  if (report) {
    await log('petiti', 'info', 'security', `Fraud report ${report.category} marked ${outcome} by admin.`, { reportId, category: report.category, outcome });
  }
  return report || null;
}

// ---------------------------------------------------------------------------
// Reading the track record back
// ---------------------------------------------------------------------------

export async function getCategoryAccuracy(category) {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
       COUNT(*) FILTER (WHERE status = 'dismissed')::int AS dismissed
     FROM fraud_reports WHERE category = $1 AND status IN ('confirmed','dismissed')`,
    [category]
  );
  const { confirmed, dismissed } = result.rows[0];
  const sampleSize = confirmed + dismissed;
  const falsePositiveRate = sampleSize > 0 ? dismissed / sampleSize : null;
  return { category, confirmed, dismissed, sampleSize, falsePositiveRate };
}

export async function getAllCategoryAccuracy() {
  const result = await query(
    `SELECT category,
       COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
       COUNT(*) FILTER (WHERE status = 'dismissed')::int AS dismissed
     FROM fraud_reports WHERE status IN ('confirmed','dismissed')
     GROUP BY category ORDER BY category`
  );
  return result.rows.map((row) => {
    const sampleSize = row.confirmed + row.dismissed;
    return {
      category: row.category,
      confirmed: row.confirmed,
      dismissed: row.dismissed,
      sampleSize,
      falsePositiveRate: sampleSize > 0 ? row.dismissed / sampleSize : null,
      adjustment: adjustmentFromRate(sampleSize > 0 ? row.dismissed / sampleSize : null, sampleSize),
    };
  });
}

// Pure function, no I/O — easy to reason about and unit-test in isolation
// from the DB. A high false-positive rate lowers future scores for that
// category (raises the bar before PETITI contains something again); a low
// one raises them slightly (PETITI has earned some extra confidence there).
function adjustmentFromRate(falsePositiveRate, sampleSize) {
  if (falsePositiveRate === null || sampleSize < MIN_SAMPLE_SIZE) return 0;
  // Maps [0, 1] false-positive rate to [+MAX_ADJUSTMENT, -MAX_ADJUSTMENT],
  // centered so a 50/50 track record makes no adjustment at all.
  const raw = (0.5 - falsePositiveRate) * (MAX_ADJUSTMENT * 2);
  return Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, Math.round(raw)));
}

// ---------------------------------------------------------------------------
// The actual learning application — call this from a detector instead of
// using its raw heuristic score directly.
// ---------------------------------------------------------------------------

/**
 * adjustedRiskScore — wraps a detector's baseline score with the
 * category's learned adjustment, clamped to a valid 0-100 risk score.
 * Falls back to the unadjusted score on any DB error (best-effort, same
 * pattern as aiKnowledgeLookup.js) so a learning-layer outage never blocks
 * detection itself.
 */
export async function adjustedRiskScore(category, baseScore) {
  try {
    const { falsePositiveRate, sampleSize } = await getCategoryAccuracy(category);
    const adjustment = adjustmentFromRate(falsePositiveRate, sampleSize);
    const adjusted = Math.max(0, Math.min(100, baseScore + adjustment));
    if (adjustment !== 0) {
      await log('petiti', 'info', 'security',
        `Risk score for ${category} adjusted ${adjustment > 0 ? '+' : ''}${adjustment} from admin review history (${sampleSize} reviewed, ${Math.round(falsePositiveRate * 100)}% false-positive).`,
        { category, baseScore, adjustment, adjusted, sampleSize });
    }
    return adjusted;
  } catch {
    return baseScore;
  }
}
