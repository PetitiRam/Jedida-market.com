// JEDIDA packaging evidence controller — phase 97.
//
// Reuses the exact same upload pipeline as payment-proof uploads
// (uploadToCloudinary/validateUploadAny in ordersController.js) — no new
// storage system. Visibility to the buyer and admin is automatic because
// it's a query against order ownership (order.buyer_id / shop owner /
// admin), not a "share" action a seller has to remember to take.

import { query } from '../config/db.js';
import { uploadToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryClient.js';
import { validateUploadAny } from '../services/uploadSecurity.js';

async function getOrderForSeller(orderId, userId) {
  const result = await query(
    `SELECT o.*, s.owner_id AS seller_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = $1`,
    [orderId]
  );
  const order = result.rows[0];
  if (!order || order.seller_id !== userId) return null;
  return order;
}

// A buyer, the seller, or an admin can view evidence for an order — no
// one else. Kept as one shared check so every read endpoint below
// enforces it identically.
async function canViewOrder(orderId, user) {
  if (user.isAdmin) return true;
  const result = await query(
    `SELECT o.buyer_id, s.owner_id AS seller_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.id = $1`,
    [orderId]
  );
  const order = result.rows[0];
  if (!order) return false;
  return order.buyer_id === user.id || order.seller_id === user.id;
}

// POST /api/orders/:orderId/packaging/evidence
// multipart/form-data: image file + { stage, caption }
export async function uploadPackagingEvidence(req, res) {
  const { orderId } = req.params;
  const { stage, caption } = req.body;
  if (!['before_packaging', 'during_packaging', 'after_packaging'].includes(stage)) {
    return res.status(400).json({ error: 'stage must be before_packaging, during_packaging, or after_packaging.' });
  }
  if (!req.file) return res.status(400).json({ error: 'An image is required.' });
  if (!isCloudinaryConfigured()) {
    return res.status(501).json({ error: 'Image upload is not configured on this server yet. Please contact support.' });
  }

  try {
    const order = await getOrderForSeller(orderId, req.user.id);
    if (!order) return res.status(404).json({ error: 'Order not found, or you are not the seller on this order.' });

    const check = await validateUploadAny(req.file, ['image'], { userId: req.user.id, ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown' });
    if (!check.ok) return res.status(400).json({ error: check.error });

    let imageUrl;
    try {
      const uploaded = await uploadToCloudinary(req.file.buffer, req.file.originalname, 'image', 'jedida-marketplace/packaging-evidence');
      imageUrl = uploaded.url;
    } catch (err) {
      console.error('Packaging evidence upload failed:', err.message);
      return res.status(502).json({ error: 'Could not upload this image. Please try again shortly.' });
    }

    const seqResult = await query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next FROM packaging_evidence WHERE order_id = $1 AND stage = $2`,
      [orderId, stage]
    );

    const inserted = await query(
      `INSERT INTO packaging_evidence (order_id, shop_id, uploaded_by, stage, image_url, caption, sequence_number, file_size_bytes, content_type, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orderId, order.shop_id, req.user.id, stage, imageUrl, caption || null, seqResult.rows[0].next, req.file.size, req.file.mimetype, req.ip || null]
    );

    // Packaging status advances with the stage being uploaded, unless the
    // seller has already moved further ahead (a re-upload of an earlier
    // stage's evidence shouldn't roll the status backward).
    const STAGE_STATUS = { before_packaging: 'preparing', during_packaging: 'packaging', after_packaging: 'packed' };
    const STATUS_RANK = { not_started: 0, preparing: 1, packaging: 2, packed: 3, handed_to_logistics: 4 };
    const targetStatus = STAGE_STATUS[stage];
    const currentRank = STATUS_RANK[order.packaging_status] ?? 0;
    if (STATUS_RANK[targetStatus] > currentRank) {
      await query(
        `UPDATE orders SET packaging_status = $2${stage === 'after_packaging' ? ', packaging_marked_ready_at = now()' : ''} WHERE id = $1`,
        [orderId, targetStatus]
      );
      if (stage === 'after_packaging') {
        await query(
          `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'system_announcement','Seller has packed your order','Your order has been packed and is ready for logistics. View the packaging photos on your order page.')`,
          [order.buyer_id]
        );
      }
    }

    res.status(201).json({ evidence: inserted.rows[0] });
  } catch (err) {
    console.error('uploadPackagingEvidence failed:', err);
    res.status(500).json({ error: 'Could not upload packaging evidence.' });
  }
}

// GET /api/orders/:orderId/packaging/evidence
// Buyer, seller, and admin all read from this one endpoint — the buyer
// automatically sees whatever the seller has uploaded (spec #22), no
// separate "share" step.
export async function listPackagingEvidence(req, res) {
  try {
    const { orderId } = req.params;
    if (!(await canViewOrder(orderId, req.user))) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const orderResult = await query('SELECT packaging_status, packaging_marked_ready_at FROM orders WHERE id = $1', [orderId]);
    const evidenceResult = await query(
      `SELECT pe.*, u.full_name AS uploaded_by_name FROM packaging_evidence pe JOIN users u ON u.id = pe.uploaded_by
       WHERE pe.order_id = $1 ORDER BY pe.stage, pe.sequence_number`,
      [orderId]
    );
    res.json({
      packagingStatus: orderResult.rows[0]?.packaging_status || 'not_started',
      packagingMarkedReadyAt: orderResult.rows[0]?.packaging_marked_ready_at || null,
      evidence: evidenceResult.rows,
    });
  } catch (err) {
    console.error('listPackagingEvidence failed:', err);
    res.status(500).json({ error: 'Could not load packaging evidence.' });
  }
}

// POST /api/orders/:orderId/packaging/evidence/:evidenceId/supersede
// { reason } — the "replace/delete under audit" path (spec #26): the old
// row is marked superseded (never deleted), a fresh upload against the
// same stage is expected as a follow-up call to uploadPackagingEvidence.
export async function supersedePackagingEvidence(req, res) {
  try {
    const { orderId, evidenceId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'A reason is required to replace or remove packaging evidence.' });

    const order = await getOrderForSeller(orderId, req.user.id);
    if (!order) return res.status(404).json({ error: 'Order not found, or you are not the seller on this order.' });

    const result = await query(
      `UPDATE packaging_evidence SET superseded_reason = $1 WHERE id = $2 AND order_id = $3 AND superseded_by IS NULL RETURNING *`,
      [reason, evidenceId, orderId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Evidence not found, or already superseded.' });
    res.json({ evidence: result.rows[0] });
  } catch (err) {
    console.error('supersedePackagingEvidence failed:', err);
    res.status(500).json({ error: 'Could not update this evidence.' });
  }
}

// POST /api/orders/:orderId/packaging/handed-to-logistics
export async function markHandedToLogistics(req, res) {
  try {
    const order = await getOrderForSeller(req.params.orderId, req.user.id);
    if (!order) return res.status(404).json({ error: 'Order not found, or you are not the seller on this order.' });
    if (order.packaging_status !== 'packed') {
      return res.status(400).json({ error: 'Mark packaging as complete (upload after-packaging evidence) before handing to logistics.' });
    }
    await query(`UPDATE orders SET packaging_status = 'handed_to_logistics' WHERE id = $1`, [order.id]);
    res.json({ message: 'Order marked as handed to logistics.' });
  } catch (err) {
    console.error('markHandedToLogistics failed:', err);
    res.status(500).json({ error: 'Could not update packaging status.' });
  }
}

// GET /api/orders/:orderId/packaging/requirements
// What the seller still needs to upload for this order's product category
// (spec #24 configurable-by-category evidence requirements).
export async function getPackagingRequirements(req, res) {
  try {
    const { orderId } = req.params;
    const productResult = await query(
      `SELECT p.category FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = $1`,
      [orderId]
    );
    const category = productResult.rows[0]?.category;
    let requirement;
    if (category) {
      const specific = await query(`SELECT * FROM packaging_evidence_requirements WHERE category = $1`, [category]);
      requirement = specific.rows[0];
    }
    if (!requirement) {
      const fallback = await query(`SELECT * FROM packaging_evidence_requirements WHERE category = ''`);
      requirement = fallback.rows[0] || { min_during_packaging_photos: 1 };
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM packaging_evidence WHERE order_id = $1 AND stage = 'during_packaging' AND superseded_by IS NULL`,
      [orderId]
    );
    res.json({
      minDuringPackagingPhotos: requirement.min_during_packaging_photos,
      uploadedDuringPackagingPhotos: Number(countResult.rows[0].count),
      meetsRequirement: Number(countResult.rows[0].count) >= requirement.min_during_packaging_photos,
    });
  } catch (err) {
    console.error('getPackagingRequirements failed:', err);
    res.status(500).json({ error: 'Could not load packaging requirements.' });
  }
}
