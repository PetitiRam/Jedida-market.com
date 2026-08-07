import { query } from '../config/db.js';

// ---------------------------------------------------------------------
// Original one-shot flow — unchanged. WalletKycPanel (seller/delivery
// "verify to unlock withdrawals" prompt) still posts here directly.
// ---------------------------------------------------------------------
export async function submitKyc(req, res) {
  const { idDocumentUrl, selfieUrl, documentType } = req.body;
  if (!idDocumentUrl) {
    return res.status(400).json({ error: 'An ID document is required.' });
  }

  try {
    const existing = await query(
      `SELECT id FROM kyc_submissions WHERE user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have a KYC submission awaiting review.' });
    }

    const result = await query(
      `INSERT INTO kyc_submissions (user_id, id_document_url, selfie_url, document_type)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, idDocumentUrl, selfieUrl || null, documentType || null]
    );
    await query(`UPDATE users SET kyc_status = 'pending' WHERE id = $1`, [req.user.id]);

    return res.status(201).json({ message: 'KYC submitted. An admin will review it shortly.', submission: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You already have a KYC submission awaiting review.' });
    }
    console.error('Submit KYC error:', err);
    return res.status(500).json({ error: 'Could not submit KYC. Please try again.' });
  }
}

export async function myKycStatus(req, res) {
  try {
    const userResult = await query('SELECT kyc_status FROM users WHERE id = $1', [req.user.id]);
    const submissions = await query(
      'SELECT * FROM kyc_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [req.user.id]
    );
    return res.json({ kycStatus: userResult.rows[0]?.kyc_status, submissions: submissions.rows });
  } catch (err) {
    console.error('My KYC status error:', err);
    return res.status(500).json({ error: 'Could not load KYC status.' });
  }
}

// ---------------------------------------------------------------------
// New multi-step wizard (Account -> Identity -> Documents -> Face ->
// Business -> Review). Fields the wizard doesn't use for a given account
// type (e.g. a buyer skips `business`) are simply left at their default.
// ---------------------------------------------------------------------

const STEP_FIELDS = {
  account: ['full_name', 'date_of_birth', 'nationality', 'country', 'district'],
  identity: ['national_id_number', 'passport_number', 'driving_permit_number', 'tin_number'],
};

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// GET /kyc/check-duplicate?nationalId=... — lightweight lookup against the
// index added in schema_phase54. Only tells the caller whether the number
// is already on file, not which account it belongs to.
export async function checkDuplicate(req, res) {
  const { nationalId } = req.query;
  if (!nationalId) return res.status(400).json({ error: 'nationalId is required.' });
  try {
    const result = await query(
      `SELECT 1 FROM kyc_submissions WHERE national_id_number = $1 AND user_id != $2 LIMIT 1`,
      [nationalId.toUpperCase(), req.user.id]
    );
    return res.json({ duplicate: result.rows.length > 0 });
  } catch (err) {
    console.error('Check duplicate KYC error:', err);
    return res.status(500).json({ error: 'Could not check for duplicates.' });
  }
}

// GET /kyc/draft — resume where the user left off. Returns the in-progress
// draft if one exists, otherwise their most recent submission (read-only,
// so a rejected/approved application still shows for reference).
export async function getDraft(req, res) {
  try {
    const draft = await query(
      `SELECT * FROM kyc_submissions WHERE user_id = $1 AND status = 'draft'`,
      [req.user.id]
    );
    if (draft.rows.length > 0) {
      return res.json({ draft: draft.rows[0] });
    }
    const latest = await query(
      `SELECT * FROM kyc_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    return res.json({ draft: null, latest: latest.rows[0] || null });
  } catch (err) {
    console.error('Get KYC draft error:', err);
    return res.status(500).json({ error: 'Could not load your saved progress.' });
  }
}

// PATCH /kyc/draft — called after every completed step. Upserts the
// single draft row for this user. Body: { step, data }, where `step` is
// 'account' | 'identity' | 'documents' | 'face' | 'business' | 'payment'
// and `data` is that step's fields.
export async function saveDraft(req, res) {
  const { step, data, currentStep } = req.body;
  if (!step || typeof data !== 'object') {
    return res.status(400).json({ error: 'step and data are required.' });
  }

  try {
    const existing = await query(
      `SELECT id FROM kyc_submissions WHERE user_id = $1 AND status = 'draft'`,
      [req.user.id]
    );

    const scalarSets = [];
    const scalarValues = [];
    let idx = 1;
    if (STEP_FIELDS[step]) {
      const scalars = pick(data, STEP_FIELDS[step]);
      for (const [k, v] of Object.entries(scalars)) {
        scalarSets.push(`${k} = $${idx}`);
        scalarValues.push(v);
        idx += 1;
      }
    }

    let jsonColumn = null;
    if (step === 'documents') jsonColumn = 'documents';
    if (step === 'face') jsonColumn = 'face_check';
    if (step === 'business') jsonColumn = 'business';
    if (step === 'payment') jsonColumn = 'payment_method';

    if (existing.rows.length === 0) {
      const insertCols = ['user_id', 'status', 'current_step', 'id_document_url'];
      const insertVals = [req.user.id, 'draft', currentStep || 1, 'pending-upload'];
      const created = await query(
        `INSERT INTO kyc_submissions (${insertCols.join(',')}) VALUES ($1,$2,$3,$4) RETURNING id`,
        insertVals
      );
      var submissionId = created.rows[0].id;
    } else {
      submissionId = existing.rows[0].id;
    }

    const sets = [...scalarSets];
    const values = [...scalarValues];
    if (jsonColumn) {
      sets.push(`${jsonColumn} = ${jsonColumn} || $${idx}::jsonb`);
      values.push(JSON.stringify(data));
      idx += 1;
    }
    sets.push(`current_step = GREATEST(current_step, $${idx})`);
    values.push(currentStep || 1);
    idx += 1;
    sets.push(`updated_at = now()`);

    values.push(submissionId);
    const result = await query(
      `UPDATE kyc_submissions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    return res.json({ draft: result.rows[0] });
  } catch (err) {
    console.error('Save KYC draft error:', err);
    return res.status(500).json({ error: 'Could not save your progress. Your last completed step is still safe.' });
  }
}

// POST /kyc/submit-full — final submission from the review step. Promotes
// the draft to 'pending' (or 'manual_review' if the client-computed
// face-check confidence is low — see kycApi.js / faceDetection.js on the
// frontend for what that score actually measures today).
export async function submitFull(req, res) {
  try {
    const draft = await query(
      `SELECT * FROM kyc_submissions WHERE user_id = $1 AND status = 'draft'`,
      [req.user.id]
    );
    if (draft.rows.length === 0) {
      return res.status(400).json({ error: 'No draft application found. Please complete the verification steps first.' });
    }
    const submission = draft.rows[0];

    if (!submission.full_name || !submission.national_id_number) {
      return res.status(400).json({ error: 'Please complete the account and identity steps before submitting.' });
    }
    const docs = submission.documents || {};
    if (!docs.national_id_front || !docs.national_id_back) {
      return res.status(400).json({ error: 'National ID front and back are required.' });
    }

    // Placeholder routing rule until a real face-match/liveness model is
    // wired in (see risk_flags below) — anything without a clearly passed
    // client-side face check goes to manual review rather than auto-approve.
    const faceCheck = submission.face_check || {};
    const needsManualReview = faceCheck.clientCheckPassed !== true;

    const result = await query(
      `UPDATE kyc_submissions
       SET status = $1,
           id_document_url = $2,
           selfie_url = $3,
           document_type = 'national_id',
           risk_flags = $4::jsonb,
           updated_at = now()
       WHERE id = $5 RETURNING *`,
      [
        needsManualReview ? 'manual_review' : 'pending',
        docs.national_id_front?.url || submission.id_document_url,
        faceCheck.selfieUrl || null,
        JSON.stringify(needsManualReview ? ['awaiting_ai_face_match'] : []),
        submission.id,
      ]
    );
    await query(`UPDATE users SET kyc_status = 'pending' WHERE id = $1`, [req.user.id]);

    return res.status(201).json({
      message: 'Verification submitted. Our team will review it shortly.',
      submission: result.rows[0],
    });
  } catch (err) {
    console.error('Submit full KYC error:', err);
    return res.status(500).json({ error: 'Could not submit your verification. Please try again.' });
  }
}
