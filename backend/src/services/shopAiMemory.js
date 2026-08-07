// Shop AI Memory — a small, private, append-mostly store of facts each
// shop's AI assistant has learned: business style, common customer
// questions, seller preferences. Every other AI bot (store designer,
// chat assistant, TAUSI analytics/marketing) reads this before generating
// anything for a given shop, and some write back to it, so the assistant
// genuinely gets more useful for that specific business over time rather
// than starting cold on every call.

import { query } from '../config/db.js';

export async function addMemory(shopId, { category = 'note', content, createdBy = 'ai' }) {
  if (!content || !content.trim()) return null;
  const result = await query(
    `INSERT INTO shop_ai_memory (shop_id, category, content, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
    [shopId, category, content.trim().slice(0, 500), createdBy]
  );
  return result.rows[0];
}

export async function listMemory(shopId, limit = 50) {
  const result = await query(
    `SELECT * FROM shop_ai_memory WHERE shop_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [shopId, limit]
  );
  return result.rows;
}

export async function deleteMemory(shopId, memoryId) {
  await query(`DELETE FROM shop_ai_memory WHERE id = $1 AND shop_id = $2`, [memoryId, shopId]);
}

// A compact digest for dropping straight into an LLM system/user prompt —
// capped so it can't blow out context on a long-lived shop.
export async function memoryDigest(shopId, limit = 12) {
  const rows = await listMemory(shopId, limit);
  if (!rows.length) return '';
  return rows.map((r) => `- (${r.category}) ${r.content}`).join('\n');
}
