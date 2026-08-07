import { query } from '../config/db.js';
import { scanKnowledgeContent, ALLOWED_COLLECTIONS, ALLOWED_SOURCE_TYPES } from '../services/aiKnowledgeGuard.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUploadAny } from '../services/uploadSecurity.js';

function badCollection(collection) {
  return !ALLOWED_COLLECTIONS.includes(collection);
}

// Uploads a source document (PDF/Word/Excel/image) for a knowledge item.
// This only stores the file and returns its URL — it does NOT create or
// touch any ai_knowledge_items row; the admin still fills in title/
// collection/description and creates the draft via createKnowledgeItem.
export async function uploadKnowledgeFile(req, res) {
  if (!isCloudinaryConfigured()) {
    return res.status(501).json({ error: 'File upload is not configured on this server yet.' });
  }
  const file = req.file;
  const check = await validateUploadAny(file, ['document', 'image']);
  if (!check.ok) {
    if (check.internalReason) console.warn('Knowledge file blocked by security scan:', check.internalReason);
    return res.status(400).json({ error: check.error });
  }

  try {
    const isImage = file.mimetype.startsWith('image/');
    const resourceType = isImage ? 'image' : 'raw';
    const fileType = isImage ? 'image' : file.mimetype === 'application/pdf' ? 'pdf' : file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') ? 'xlsx' : 'docx';
    const result = await uploadToCloudinary(file.buffer, file.originalname, resourceType, 'jedida-ai-training');
    return res.status(201).json({ fileUrl: result.url, fileType, originalName: file.originalname });
  } catch (err) {
    console.error('AI training uploadKnowledgeFile error:', err);
    return res.status(502).json({ error: 'Could not upload the file. Please try again.' });
  }
}

// ---------------------------------------------------------------------
// Knowledge Library
// ---------------------------------------------------------------------

export async function listKnowledge(req, res) {
  try {
    const { status, collection, q, limit } = req.query;
    const params = [];
    let sql = `SELECT k.*, u.full_name AS submitted_by_name
               FROM ai_knowledge_items k JOIN users u ON u.id = k.submitted_by
               WHERE k.is_current = TRUE`;
    if (status) { params.push(status); sql += ` AND k.status = $${params.length}`; }
    if (collection) { params.push(collection); sql += ` AND k.collection = $${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND k.title ILIKE $${params.length}`; }
    params.push(Math.min(Number(limit) || 100, 500));
    sql += ` ORDER BY k.updated_at DESC LIMIT $${params.length}`;
    const result = await query(sql, params);
    return res.json({ knowledge: result.rows });
  } catch (err) {
    console.error('AI training listKnowledge error:', err);
    return res.status(500).json({ error: 'Could not load the knowledge library.' });
  }
}

export async function getKnowledgeItem(req, res) {
  try {
    const item = await query('SELECT * FROM ai_knowledge_items WHERE id = $1', [req.params.id]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Knowledge item not found.' });
    const versions = await query(
      `SELECT id, version, status, updated_at FROM ai_knowledge_items
       WHERE title = $1 AND collection = $2 ORDER BY version DESC`,
      [item.rows[0].title, item.rows[0].collection]
    );
    return res.json({ item: item.rows[0], versions: versions.rows });
  } catch (err) {
    console.error('AI training getKnowledgeItem error:', err);
    return res.status(500).json({ error: 'Could not load this knowledge item.' });
  }
}

// Create a new knowledge item as a Draft. Admins can create directly;
// business owners/support submit via suggestions/corrections instead (see
// aiTrainingContributionsController.js), which land here only once approved.
export async function createKnowledgeItem(req, res) {
  try {
    const { title, collection, sourceType, content, fileUrl, fileType, tags } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'Title and content are required.' });
    }
    if (badCollection(collection)) return res.status(400).json({ error: 'Invalid collection.' });
    const resolvedSourceType = ALLOWED_SOURCE_TYPES.includes(sourceType) ? sourceType : 'help_article';

    const scan = scanKnowledgeContent(`${title}\n${content}`);

    const result = await query(
      `INSERT INTO ai_knowledge_items
         (title, collection, source_type, content, file_url, file_type, tags, submitted_by, security_flags, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
       RETURNING *`,
      [title.trim(), collection, resolvedSourceType, content.trim(), fileUrl || null, fileType || null,
       Array.isArray(tags) ? tags : [], req.user.id, scan.flags]
    );
    return res.status(201).json({ item: result.rows[0], securityFlags: scan.flags });
  } catch (err) {
    console.error('AI training createKnowledgeItem error:', err);
    return res.status(500).json({ error: 'Could not create the knowledge item.' });
  }
}

export async function updateKnowledgeItem(req, res) {
  try {
    const existing = await query('SELECT * FROM ai_knowledge_items WHERE id = $1', [req.params.id]);
    const item = existing.rows[0];
    if (!item) return res.status(404).json({ error: 'Knowledge item not found.' });
    if (!['draft', 'in_review', 'rejected'].includes(item.status)) {
      return res.status(409).json({ error: 'Only draft, in-review, or rejected items can be edited directly. Create a new version for published knowledge instead.' });
    }
    const { title, content, collection, tags, fileUrl, fileType } = req.body;
    if (collection && badCollection(collection)) return res.status(400).json({ error: 'Invalid collection.' });

    const nextTitle = title?.trim() || item.title;
    const nextContent = content?.trim() ?? item.content;
    const scan = scanKnowledgeContent(`${nextTitle}\n${nextContent}`);

    const updated = await query(
      `UPDATE ai_knowledge_items
       SET title=$1, content=$2, collection=$3, tags=$4, file_url=$5, file_type=$6,
           security_flags=$7, status='draft', rejection_reason=NULL, updated_at=now()
       WHERE id=$8 RETURNING *`,
      [nextTitle, nextContent, collection || item.collection, Array.isArray(tags) ? tags : item.tags,
       fileUrl ?? item.file_url, fileType ?? item.file_type, scan.flags, req.params.id]
    );
    return res.json({ item: updated.rows[0], securityFlags: scan.flags });
  } catch (err) {
    console.error('AI training updateKnowledgeItem error:', err);
    return res.status(500).json({ error: 'Could not update the knowledge item.' });
  }
}

// Draft -> Review
export async function submitForReview(req, res) {
  try {
    const item = await query('SELECT * FROM ai_knowledge_items WHERE id = $1', [req.params.id]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Knowledge item not found.' });
    if (item.rows[0].status !== 'draft') return res.status(409).json({ error: 'Only drafts can be submitted for review.' });

    const scan = scanKnowledgeContent(`${item.rows[0].title}\n${item.rows[0].content}`);
    if (!scan.clean) {
      await query(`UPDATE ai_knowledge_items SET security_flags=$1, updated_at=now() WHERE id=$2`, [scan.flags, req.params.id]);
      return res.status(422).json({ error: 'This content was flagged and cannot proceed until fixed.', flags: scan.flags });
    }

    const updated = await query(
      `UPDATE ai_knowledge_items SET status='in_review', security_flags='{}', updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error('AI training submitForReview error:', err);
    return res.status(500).json({ error: 'Could not submit for review.' });
  }
}

// Review -> Admin Approval (approve or reject)
export async function reviewKnowledgeItem(req, res) {
  try {
    const { decision, notes } = req.body; // decision: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });

    const item = await query('SELECT * FROM ai_knowledge_items WHERE id = $1', [req.params.id]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Knowledge item not found.' });
    if (item.rows[0].status !== 'in_review') return res.status(409).json({ error: 'Only items in review can be approved or rejected.' });

    if (decision === 'approve') {
      const scan = scanKnowledgeContent(`${item.rows[0].title}\n${item.rows[0].content}`);
      if (!scan.clean) {
        return res.status(422).json({ error: 'This content was flagged and cannot be approved until fixed.', flags: scan.flags });
      }
      const updated = await query(
        `UPDATE ai_knowledge_items
         SET status='approved', reviewed_by=$1, approved_by=$1, reviewed_at=now(), approved_at=now(), updated_at=now()
         WHERE id=$2 RETURNING *`,
        [req.user.id, req.params.id]
      );
      return res.json({ item: updated.rows[0] });
    }

    const updated = await query(
      `UPDATE ai_knowledge_items
       SET status='rejected', reviewed_by=$1, reviewed_at=now(), rejection_reason=$2, updated_at=now()
       WHERE id=$3 RETURNING *`,
      [req.user.id, notes || 'Rejected by admin', req.params.id]
    );
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error('AI training reviewKnowledgeItem error:', err);
    return res.status(500).json({ error: 'Could not record the review decision.' });
  }
}

export async function archiveKnowledgeItem(req, res) {
  try {
    const updated = await query(
      `UPDATE ai_knowledge_items SET status='archived', is_current=FALSE, archived_at=now(), updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Knowledge item not found.' });
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error('AI training archiveKnowledgeItem error:', err);
    return res.status(500).json({ error: 'Could not archive this item.' });
  }
}

// Creates a new draft version of a published/approved item, so edits to
// live knowledge don't silently change what the AI has already indexed.
export async function createNewVersion(req, res) {
  try {
    const prev = await query('SELECT * FROM ai_knowledge_items WHERE id = $1', [req.params.id]);
    if (!prev.rows[0]) return res.status(404).json({ error: 'Knowledge item not found.' });
    const p = prev.rows[0];
    const { content, title } = req.body;
    const nextTitle = title?.trim() || p.title;
    const nextContent = content?.trim() || p.content;
    const scan = scanKnowledgeContent(`${nextTitle}\n${nextContent}`);

    const created = await query(
      `INSERT INTO ai_knowledge_items
        (title, collection, source_type, content, file_url, file_type, tags, submitted_by,
         security_flags, status, version, previous_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11) RETURNING *`,
      [nextTitle, p.collection, p.source_type, nextContent, p.file_url, p.file_type, p.tags,
       req.user.id, scan.flags, p.version + 1, p.id]
    );
    // Older version stays visible in history but is no longer "current" for library listing.
    await query(`UPDATE ai_knowledge_items SET is_current=FALSE WHERE id=$1`, [p.id]);
    return res.status(201).json({ item: created.rows[0] });
  } catch (err) {
    console.error('AI training createNewVersion error:', err);
    return res.status(500).json({ error: 'Could not create a new version.' });
  }
}

// ---------------------------------------------------------------------
// AI Learning Jobs — Approved -> Indexed -> Published (available to AI)
// ---------------------------------------------------------------------

export async function listTrainingJobs(req, res) {
  try {
    const result = await query(
      `SELECT j.*, u.full_name AS triggered_by_name FROM ai_training_jobs j
       JOIN users u ON u.id = j.triggered_by ORDER BY j.started_at DESC LIMIT 200`
    );
    return res.json({ jobs: result.rows });
  } catch (err) {
    console.error('AI training listTrainingJobs error:', err);
    return res.status(500).json({ error: 'Could not load training history.' });
  }
}

export async function createTrainingJob(req, res) {
  const { name, knowledgeItemIds } = req.body;
  if (!Array.isArray(knowledgeItemIds) || knowledgeItemIds.length === 0) {
    return res.status(400).json({ error: 'Select at least one approved knowledge item.' });
  }
  try {
    const approved = await query(
      `SELECT id FROM ai_knowledge_items WHERE id = ANY($1::uuid[]) AND status = 'approved'`,
      [knowledgeItemIds]
    );
    if (approved.rows.length === 0) {
      return res.status(400).json({ error: 'None of the selected items are in an approved state.' });
    }
    const ids = approved.rows.map((r) => r.id);

    const job = await query(
      `INSERT INTO ai_training_jobs (name, status, triggered_by, item_count, completed_at)
       VALUES ($1, 'completed', $2, $3, now()) RETURNING *`,
      [name?.trim() || `Training run ${new Date().toISOString().slice(0, 10)}`, req.user.id, ids.length]
    );

    for (const id of ids) {
      await query(`INSERT INTO ai_training_job_items (job_id, knowledge_item_id) VALUES ($1,$2)`, [job.rows[0].id, id]);
    }
    await query(
      `UPDATE ai_knowledge_items
       SET status='published', published_by=$1, published_at=now(), updated_at=now()
       WHERE id = ANY($2::uuid[])`,
      [req.user.id, ids]
    );

    return res.status(201).json({ job: job.rows[0], indexedCount: ids.length, skipped: knowledgeItemIds.length - ids.length });
  } catch (err) {
    console.error('AI training createTrainingJob error:', err);
    return res.status(500).json({ error: 'Could not run the training job.' });
  }
}

export async function getTrainingJob(req, res) {
  try {
    const job = await query('SELECT * FROM ai_training_jobs WHERE id = $1', [req.params.id]);
    if (!job.rows[0]) return res.status(404).json({ error: 'Training job not found.' });
    const items = await query(
      `SELECT k.id, k.title, k.collection FROM ai_training_job_items ji
       JOIN ai_knowledge_items k ON k.id = ji.knowledge_item_id WHERE ji.job_id = $1`,
      [req.params.id]
    );
    return res.json({ job: job.rows[0], items: items.rows });
  } catch (err) {
    console.error('AI training getTrainingJob error:', err);
    return res.status(500).json({ error: 'Could not load this training job.' });
  }
}

// ---------------------------------------------------------------------
// Pending Approval — suggestions + corrections in one queue
// ---------------------------------------------------------------------

export async function listPendingApprovals(req, res) {
  try {
    const suggestions = await query(
      `SELECT s.*, u.full_name AS suggested_by_name FROM ai_knowledge_suggestions s
       JOIN users u ON u.id = s.suggested_by WHERE s.status = 'pending' ORDER BY s.created_at DESC LIMIT 200`
    );
    const corrections = await query(
      `SELECT c.*, u.full_name AS submitted_by_name FROM ai_answer_corrections c
       JOIN users u ON u.id = c.submitted_by WHERE c.status = 'pending' ORDER BY c.created_at DESC LIMIT 200`
    );
    return res.json({ suggestions: suggestions.rows, corrections: corrections.rows });
  } catch (err) {
    console.error('AI training listPendingApprovals error:', err);
    return res.status(500).json({ error: 'Could not load pending approvals.' });
  }
}

export async function reviewSuggestion(req, res) {
  try {
    const { decision, notes } = req.body;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });
    const suggestion = await query('SELECT * FROM ai_knowledge_suggestions WHERE id = $1', [req.params.id]);
    if (!suggestion.rows[0]) return res.status(404).json({ error: 'Suggestion not found.' });
    if (suggestion.rows[0].status !== 'pending') return res.status(409).json({ error: 'This suggestion was already reviewed.' });
    const s = suggestion.rows[0];

    let resultingItem = null;
    if (decision === 'approve') {
      const scan = scanKnowledgeContent(`${s.question}\n${s.suggested_answer}`);
      if (!scan.clean) return res.status(422).json({ error: 'This content was flagged and cannot be approved as-is.', flags: scan.flags });
      const created = await query(
        `INSERT INTO ai_knowledge_items
           (title, collection, source_type, content, submitted_by, reviewed_by, approved_by,
            reviewed_at, approved_at, status)
         VALUES ($1,$2,'faq',$3,$4,$5,$5,now(),now(),'approved') RETURNING *`,
        [s.question.slice(0, 200), s.collection, s.suggested_answer, s.suggested_by, req.user.id]
      );
      resultingItem = created.rows[0];
    }

    const updated = await query(
      `UPDATE ai_knowledge_suggestions
       SET status=$1, reviewed_by=$2, review_notes=$3, resulting_knowledge_item_id=$4, resolved_at=now()
       WHERE id=$5 RETURNING *`,
      [decision === 'approve' ? 'approved' : 'rejected', req.user.id, notes || null, resultingItem?.id || null, req.params.id]
    );
    return res.json({ suggestion: updated.rows[0], knowledgeItem: resultingItem });
  } catch (err) {
    console.error('AI training reviewSuggestion error:', err);
    return res.status(500).json({ error: 'Could not review this suggestion.' });
  }
}

export async function reviewCorrection(req, res) {
  try {
    const { decision, notes, collection } = req.body;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });
    const correction = await query('SELECT * FROM ai_answer_corrections WHERE id = $1', [req.params.id]);
    if (!correction.rows[0]) return res.status(404).json({ error: 'Correction not found.' });
    if (correction.rows[0].status !== 'pending') return res.status(409).json({ error: 'This correction was already reviewed.' });
    const c = correction.rows[0];

    let resultingItem = null;
    if (decision === 'approve') {
      const resolvedCollection = ALLOWED_COLLECTIONS.includes(collection) ? collection
        : (ALLOWED_COLLECTIONS.includes(c.collection) ? c.collection : 'buyer_support');
      const scan = scanKnowledgeContent(c.corrected_answer);
      if (!scan.clean) return res.status(422).json({ error: 'This content was flagged and cannot be approved as-is.', flags: scan.flags });
      const created = await query(
        `INSERT INTO ai_knowledge_items
           (title, collection, source_type, content, submitted_by, reviewed_by, approved_by,
            reviewed_at, approved_at, status)
         VALUES ($1,$2,'support_correction',$3,$4,$5,$5,now(),now(),'approved') RETURNING *`,
        [`Correction: ${c.corrected_answer.slice(0, 150)}`, resolvedCollection, c.corrected_answer, c.submitted_by, req.user.id]
      );
      resultingItem = created.rows[0];
    }

    const updated = await query(
      `UPDATE ai_answer_corrections
       SET status=$1, reviewed_by=$2, review_notes=$3, resulting_knowledge_item_id=$4, resolved_at=now()
       WHERE id=$5 RETURNING *`,
      [decision === 'approve' ? 'approved' : 'rejected', req.user.id, notes || null, resultingItem?.id || null, req.params.id]
    );
    return res.json({ correction: updated.rows[0], knowledgeItem: resultingItem });
  } catch (err) {
    console.error('AI training reviewCorrection error:', err);
    return res.status(500).json({ error: 'Could not review this correction.' });
  }
}

// ---------------------------------------------------------------------
// Suggested Knowledge / knowledge gaps
// ---------------------------------------------------------------------

export async function listKnowledgeGaps(req, res) {
  try {
    const { status } = req.query;
    const params = [];
    let sql = `SELECT g.*, u.full_name AS flagged_by_name FROM ai_knowledge_gaps g
               LEFT JOIN users u ON u.id = g.flagged_by WHERE 1=1`;
    if (status) { params.push(status); sql += ` AND g.status = $${params.length}`; }
    sql += ' ORDER BY g.frequency_count DESC, g.updated_at DESC LIMIT 200';
    const result = await query(sql, params);
    return res.json({ gaps: result.rows });
  } catch (err) {
    console.error('AI training listKnowledgeGaps error:', err);
    return res.status(500).json({ error: 'Could not load knowledge gaps.' });
  }
}

export async function dismissKnowledgeGap(req, res) {
  try {
    const updated = await query(
      `UPDATE ai_knowledge_gaps SET status='dismissed', updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Gap not found.' });
    return res.json({ gap: updated.rows[0] });
  } catch (err) {
    console.error('AI training dismissKnowledgeGap error:', err);
    return res.status(500).json({ error: 'Could not update this gap.' });
  }
}

// ---------------------------------------------------------------------
// Published Knowledge (what the AI can currently use)
// ---------------------------------------------------------------------

export async function listPublishedKnowledge(req, res) {
  try {
    const { collection } = req.query;
    const params = [];
    let sql = `SELECT id, title, collection, source_type, published_at, tags FROM ai_knowledge_items
               WHERE status = 'published' AND is_current = TRUE`;
    if (collection) { params.push(collection); sql += ` AND collection = $${params.length}`; }
    sql += ' ORDER BY published_at DESC LIMIT 500';
    const result = await query(sql, params);
    return res.json({ published: result.rows });
  } catch (err) {
    console.error('AI training listPublishedKnowledge error:', err);
    return res.status(500).json({ error: 'Could not load published knowledge.' });
  }
}

// ---------------------------------------------------------------------
// Performance Reports
// ---------------------------------------------------------------------

export async function performanceReport(req, res) {
  try {
    const answered = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM chat_messages WHERE is_ai = TRUE AND created_at > now() - interval '30 days') +
         (SELECT COUNT(*)::int FROM ai_assistant_messages WHERE role = 'assistant' AND created_at > now() - interval '30 days')
       AS count`
    );
    const handovers = await query(
      `SELECT COUNT(*)::int AS count FROM chat_ai_escalations WHERE created_at > now() - interval '30 days'`
    );
    const feedback = await query(
      `SELECT rating, COUNT(*)::int AS count FROM ai_conversation_feedback
       WHERE created_at > now() - interval '30 days' GROUP BY rating`
    );
    const helpfulRow = feedback.rows.find((r) => r.rating === 'helpful');
    const notHelpfulRow = feedback.rows.find((r) => r.rating === 'not_helpful');
    const helpful = helpfulRow?.count || 0;
    const notHelpful = notHelpfulRow?.count || 0;
    const totalRated = helpful + notHelpful;

    const gaps = await query(`SELECT COUNT(*)::int AS count FROM ai_knowledge_gaps WHERE status = 'open'`);
    const knowledgeByStatus = await query(
      `SELECT status, COUNT(*)::int AS count FROM ai_knowledge_items WHERE is_current = TRUE GROUP BY status`
    );
    const knowledgeByCollection = await query(
      `SELECT collection, COUNT(*)::int AS count FROM ai_knowledge_items
       WHERE status = 'published' AND is_current = TRUE GROUP BY collection`
    );

    return res.json({
      periodDays: 30,
      questionsAnswered: answered.rows[0].count,
      humanHandovers: handovers.rows[0].count,
      feedback: { helpful, notHelpful, totalRated, accuracyRate: totalRated ? Math.round((helpful / totalRated) * 100) : null },
      openKnowledgeGaps: gaps.rows[0].count,
      knowledgeByStatus: knowledgeByStatus.rows,
      knowledgeByCollection: knowledgeByCollection.rows,
    });
  } catch (err) {
    console.error('AI training performanceReport error:', err);
    return res.status(500).json({ error: 'Could not build the performance report.' });
  }
}
