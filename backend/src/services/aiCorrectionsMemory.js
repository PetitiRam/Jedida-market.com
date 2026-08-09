import { query } from '../config/db.js';

const MAX_LESSONS = 6;
const LESSON_MAX_CHARS = 240;

export async function getApprovedCorrectionLessons(collection = null) {
  try {
    const params = [];
    let sql = `SELECT original_answer, corrected_answer, collection
               FROM ai_answer_corrections
               WHERE status = 'approved'`;
    if (collection) {
      params.push(collection);
      sql += ` AND collection = $${params.length}`;
    }
    params.push(MAX_LESSONS);
    sql += ` ORDER BY resolved_at DESC NULLS LAST, created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    if (result.rows.length === 0) return null;

    const lines = result.rows.map((row, i) => {
      const corrected = String(row.corrected_answer || '').slice(0, LESSON_MAX_CHARS);
      const original = row.original_answer ? String(row.original_answer).slice(0, 120) : null;
      return original
        ? `${i + 1}. Instead of answering like "${original}...", the correct answer is: ${corrected}`
        : `${i + 1}. ${corrected}`;
    });

    return lines.join('\n');
  } catch (err) {
    console.error('aiCorrectionsMemory: could not load approved corrections, skipping:', err.message);
    return null;
  }
}
