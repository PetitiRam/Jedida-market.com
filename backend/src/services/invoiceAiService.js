// Jedida AI Invoice Assistant — creates invoices from orders, explains
// documents in plain language, flags likely mistakes, and summarizes a
// business's sales. Deterministic, rule-based, no external API — see
// backend/src/ai/orchestrator.js for the design rationale.

import { query } from '../config/db.js';
import { createManualInvoice } from './documentService.js';

// Build a retail invoice straight from an existing order — the "Create
// invoices from orders" feature. Deterministic (no AI needed) since the
// mapping from order -> invoice line item is unambiguous.
export async function createInvoiceFromOrder(issuerUser, orderId, extra = {}) {
  const result = await query(
    `SELECT o.*, p.title AS product_title, s.id AS shop_id
     FROM orders o JOIN products p ON p.id = o.product_id JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1 AND s.owner_id = $2`,
    [orderId, issuerUser.id]
  );
  const order = result.rows[0];
  if (!order) {
    const err = new Error('Order not found or does not belong to your shop.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return createManualInvoice(issuerUser, {
    category: extra.category || 'retail',
    recipientId: order.buyer_id,
    orderId: order.id,
    shopId: order.shop_id,
    currency: order.currency,
    notes: extra.notes || `Generated from order ${order.id.slice(0, 8)}.`,
    items: [{ productId: order.product_id, description: order.product_title, quantity: order.quantity, unitPrice: order.unit_price }]
  });
}

function heuristicExplain(doc, items) {
  const lines = [
    `This is a ${doc.document_type.replace('_', ' ')} numbered ${doc.document_number}, totaling ${doc.currency} ${doc.total_amount}.`,
  ];
  if (items.length) lines.push(`It covers ${items.length} item(s), the largest being "${items[0].description}".`);
  if (doc.payment_status) lines.push(`Payment status: ${doc.payment_status}.`);
  if (doc.due_date) lines.push(`Payment is due by ${new Date(doc.due_date).toLocaleDateString()}.`);
  lines.push(`Verification code ${doc.verification_code} can be scanned to confirm this document is genuine.`);
  return lines.join(' ');
}

export async function explainDocument(doc, items) {
  return heuristicExplain(doc, items);
}

function heuristicDetectIssues(doc, items) {
  const issues = [];
  const computedSubtotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0);
  if (Math.abs(computedSubtotal - Number(doc.subtotal_amount)) > 0.01) {
    issues.push(`Subtotal (${doc.subtotal_amount}) doesn't match the sum of line items (${computedSubtotal.toFixed(2)}).`);
  }
  const expectedTotal = Number(doc.subtotal_amount) - Number(doc.discount_amount) + Number(doc.tax_amount) + Number(doc.delivery_fee_amount);
  if (Math.abs(expectedTotal - Number(doc.total_amount)) > 0.01) {
    issues.push(`Total (${doc.total_amount}) doesn't match subtotal - discount + tax + delivery (${expectedTotal.toFixed(2)}).`);
  }
  if (!doc.recipient_id && !(doc.recipient_snapshot && Object.keys(doc.recipient_snapshot).length)) {
    issues.push('No buyer/recipient is attached to this document.');
  }
  if (doc.document_type.includes('invoice') && !doc.due_date && doc.status !== 'draft') {
    issues.push('This invoice has no due date set.');
  }
  if (!items.length) issues.push('This document has no line items.');
  return issues;
}

export async function detectDocumentIssues(doc, items) {
  return heuristicDetectIssues(doc, items);
}

function heuristicSummarize(rows) {
  const totalSales = rows.reduce((s, r) => s + Number(r.total_amount), 0);
  return `${rows.length} document(s) totaling ${totalSales.toFixed(2)}. Most common type: ${
    Object.entries(rows.reduce((acc, r) => { acc[r.document_type] = (acc[r.document_type] || 0) + 1; return acc; }, {}))
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'n/a'
  }.`;
}

export async function summarizeSales(businessId, { since, until } = {}) {
  const result = await query(
    `SELECT document_type, total_amount, currency, created_at FROM documents
     WHERE issuer_id = $1 AND document_type IN ('digital_receipt','sales_invoice','wholesale_invoice','purchase_invoice','agriculture_bulk_invoice')
       AND created_at BETWEEN $2 AND $3
     ORDER BY created_at DESC`,
    [businessId, since || new Date(Date.now() - 30 * 86400000), until || new Date()]
  );
  const rows = result.rows;
  return heuristicSummarize(rows);
}

export async function generateMonthlyReport(businessId, { year, month } = {}) {
  const now = new Date();
  const y = year || now.getFullYear();
  const m = month || now.getMonth() + 1;
  const periodStart = new Date(Date.UTC(y, m - 1, 1));
  const periodEnd = new Date(Date.UTC(y, m, 1));

  const result = await query(
    `SELECT document_type, COUNT(*)::int AS count, COALESCE(SUM(total_amount),0) AS total
     FROM documents WHERE issuer_id = $1 AND created_at >= $2 AND created_at < $3
     GROUP BY document_type ORDER BY total DESC`,
    [businessId, periodStart, periodEnd]
  );
  const summary = await summarizeSales(businessId, { since: periodStart, until: periodEnd });
  return { periodStart, periodEnd, breakdown: result.rows, summary };
}
