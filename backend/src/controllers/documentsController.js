import { query, withTransaction } from '../config/db.js';
import * as documentService from '../services/documentService.js';
import { streamDocumentPdf } from '../services/pdfService.js';
import * as invoiceAi from '../services/invoiceAiService.js';

const INVOICE_TYPES = ['sales_invoice', 'purchase_invoice', 'wholesale_invoice', 'proforma_invoice', 'purchase_order', 'agriculture_bulk_invoice'];

async function loadDocumentWithItems(id) {
  const doc = await query('SELECT * FROM documents WHERE id = $1', [id]);
  if (!doc.rows[0]) return null;
  const items = await query('SELECT * FROM document_line_items WHERE document_id = $1 ORDER BY sort_order', [id]);
  return { document: doc.rows[0], items: items.rows };
}

function canAccess(doc, user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return doc.issuer_id === user.id || doc.recipient_id === user.id;
}

// ------------------------------------------------------------------
// BUYER DOCUMENT CENTER
// ------------------------------------------------------------------

async function listForBuyer(req, res, typeFilter) {
  try {
    const params = [req.user.id];
    let sql = `SELECT d.*, i.invoice_category FROM documents d LEFT JOIN invoices i ON i.id = d.id WHERE d.recipient_id = $1`;
    if (typeFilter) {
      params.push(typeFilter);
      sql += ` AND d.document_type = ANY($2::document_type[])`;
    }
    sql += ' ORDER BY d.created_at DESC LIMIT 200';
    const result = await query(sql, params);
    return res.json({ documents: result.rows });
  } catch (err) {
    console.error('List buyer documents error:', err);
    return res.status(500).json({ error: 'Could not load your documents.' });
  }
}

export const buyerHistory = (req, res) => listForBuyer(req, res, null);
export const buyerReceipts = (req, res) => listForBuyer(req, res, ['digital_receipt', 'order_confirmation']);
export const buyerInvoices = (req, res) => listForBuyer(req, res, INVOICE_TYPES);
export const buyerRefunds = (req, res) => listForBuyer(req, res, ['refund_receipt']);
export const buyerDeliveries = (req, res) => listForBuyer(req, res, ['delivery_receipt']);

// ------------------------------------------------------------------
// SELLER / BUSINESS CENTER
// ------------------------------------------------------------------

export async function sellerInvoices(req, res) {
  try {
    const { category, status, q } = req.query;
    const params = [req.user.id];
    let sql = `SELECT d.*, i.invoice_category FROM documents d JOIN invoices i ON i.id = d.id WHERE d.issuer_id = $1`;
    if (category) { params.push(category); sql += ` AND i.invoice_category = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND d.status = $${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (d.document_number ILIKE $${params.length} OR d.notes ILIKE $${params.length})`; }
    sql += ' ORDER BY d.created_at DESC LIMIT 300';
    const result = await query(sql, params);
    return res.json({ invoices: result.rows });
  } catch (err) {
    console.error('Seller invoices error:', err);
    return res.status(500).json({ error: 'Could not load invoices.' });
  }
}

export async function sellerSales(req, res) {
  try {
    const result = await query(
      `SELECT * FROM documents WHERE issuer_id = $1 AND document_type = 'digital_receipt' ORDER BY created_at DESC LIMIT 300`,
      [req.user.id]
    );
    return res.json({ sales: result.rows });
  } catch (err) {
    console.error('Seller sales error:', err);
    return res.status(500).json({ error: 'Could not load sales.' });
  }
}

export async function sellerPendingPayments(req, res) {
  try {
    const result = await query(
      `SELECT d.*, i.invoice_category FROM documents d JOIN invoices i ON i.id = d.id
       WHERE d.issuer_id = $1 AND d.status IN ('draft','sent','overdue','partially_paid')
       ORDER BY d.due_date NULLS LAST, d.created_at DESC`,
      [req.user.id]
    );
    return res.json({ pending: result.rows });
  } catch (err) {
    console.error('Seller pending payments error:', err);
    return res.status(500).json({ error: 'Could not load pending payments.' });
  }
}

export async function sellerRevenueReport(req, res) {
  try {
    const result = await query(
      `SELECT date_trunc('month', created_at) AS month, document_type, COUNT(*)::int AS count, COALESCE(SUM(total_amount),0) AS total
       FROM documents WHERE issuer_id = $1 AND document_type IN ('digital_receipt','sales_invoice','wholesale_invoice','purchase_invoice','agriculture_bulk_invoice')
       GROUP BY month, document_type ORDER BY month DESC LIMIT 60`,
      [req.user.id]
    );
    return res.json({ report: result.rows });
  } catch (err) {
    console.error('Seller revenue report error:', err);
    return res.status(500).json({ error: 'Could not build revenue report.' });
  }
}

export async function sellerCustomerHistory(req, res) {
  try {
    const result = await query(
      `SELECT * FROM documents WHERE issuer_id = $1 AND recipient_id = $2 ORDER BY created_at DESC LIMIT 200`,
      [req.user.id, req.params.customerId]
    );
    return res.json({ documents: result.rows });
  } catch (err) {
    console.error('Customer history error:', err);
    return res.status(500).json({ error: 'Could not load customer history.' });
  }
}

// ------------------------------------------------------------------
// INVOICE CRUD (retail / wholesale / supplier / manufacturer / agri bulk / proforma / PO)
// ------------------------------------------------------------------

export async function createInvoice(req, res) {
  try {
    const doc = await documentService.createManualInvoice(req.user, req.body || {});
    return res.status(201).json({ message: 'Invoice created.', invoice: doc });
  } catch (err) {
    if (err.code === 'NO_ITEMS') return res.status(400).json({ error: err.message });
    console.error('Create invoice error:', err);
    return res.status(500).json({ error: 'Could not create invoice.' });
  }
}

export async function getInvoice(req, res) {
  try {
    const found = await loadDocumentWithItems(req.params.id);
    if (!found) return res.status(404).json({ error: 'Document not found.' });
    if (!canAccess(found.document, req.user)) return res.status(403).json({ error: 'You do not have access to this document.' });
    return res.json(found);
  } catch (err) {
    console.error('Get document error:', err);
    return res.status(500).json({ error: 'Could not load document.' });
  }
}

export async function updateInvoice(req, res) {
  try {
    const existing = await query('SELECT * FROM documents WHERE id = $1 AND issuer_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Invoice not found.' });

    const { notes, paymentTerms, dueDate, signatureUrl, status } = req.body || {};
    const updated = await query(
      `UPDATE documents SET
         notes = COALESCE($1, notes),
         payment_terms = COALESCE($2, payment_terms),
         due_date = COALESCE($3, due_date),
         signature_url = COALESCE($4, signature_url),
         status = COALESCE($5, status)
       WHERE id = $6 RETURNING *`,
      [notes ?? null, paymentTerms ?? null, dueDate ?? null, signatureUrl ?? null, status ?? null, req.params.id]
    );
    return res.json({ message: 'Invoice updated.', invoice: updated.rows[0] });
  } catch (err) {
    console.error('Update invoice error:', err);
    return res.status(500).json({ error: 'Could not update invoice.' });
  }
}

export async function updateInvoiceStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['draft', 'sent', 'viewed', 'paid', 'partially_paid', 'overdue', 'cancelled', 'void'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const updated = await query(
      `UPDATE documents SET status = $1 WHERE id = $2 AND issuer_id = $3 RETURNING *`,
      [status, req.params.id, req.user.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Invoice not found.' });

    if (status === 'paid' && updated.rows[0].recipient_id) {
      await query(
        `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'invoice_paid','Invoice marked paid',$2)`,
        [updated.rows[0].recipient_id, `Invoice ${updated.rows[0].document_number} was marked as paid.`]
      );
    }
    return res.json({ message: 'Invoice status updated.', invoice: updated.rows[0] });
  } catch (err) {
    console.error('Update invoice status error:', err);
    return res.status(500).json({ error: 'Could not update invoice status.' });
  }
}

export async function duplicateInvoice(req, res) {
  try {
    const copy = await documentService.duplicateInvoice(req.params.id, req.user);
    if (!copy) return res.status(404).json({ error: 'Invoice not found.' });
    return res.status(201).json({ message: 'Invoice duplicated.', invoice: copy });
  } catch (err) {
    console.error('Duplicate invoice error:', err);
    return res.status(500).json({ error: 'Could not duplicate invoice.' });
  }
}

// Send an invoice through Jedida chat — reuses the existing buyer<->admin
// chat bridge, attaching the PDF link and a short message.
export async function sendInvoiceViaChat(req, res) {
  try {
    const doc = await query('SELECT * FROM documents WHERE id = $1 AND issuer_id = $2', [req.params.id, req.user.id]);
    if (!doc.rows[0]) return res.status(404).json({ error: 'Invoice not found.' });
    if (!doc.rows[0].recipient_id) return res.status(400).json({ error: 'This invoice has no recipient to send it to.' });

    const { getOrCreateConversation, saveMessage } = await import('../chat/chatService.js');
    const convo = await getOrCreateConversation({ userId: doc.rows[0].recipient_id, orderId: doc.rows[0].order_id || undefined });
    const pdfUrl = `${(process.env.BACKEND_URL || '').replace(/\/$/, '')}/api/documents/${doc.rows[0].id}/pdf`;
    await saveMessage({
      conversationId: convo.id, userId: doc.rows[0].recipient_id, senderId: req.user.id,
      body: req.body?.message || `You've received ${doc.rows[0].document_number} for ${doc.rows[0].currency} ${doc.rows[0].total_amount}.`,
      messageType: 'invoice', attachmentUrl: pdfUrl,
      attachmentMeta: { documentId: doc.rows[0].id, documentNumber: doc.rows[0].document_number, totalAmount: doc.rows[0].total_amount }
    });

    await query(
      `UPDATE documents SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END WHERE id = $1`,
      [doc.rows[0].id]
    );
    await query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'invoice_received','New invoice received',$2)`,
      [doc.rows[0].recipient_id, `You received invoice ${doc.rows[0].document_number}.`]
    );

    return res.json({ message: 'Invoice sent via Jedida chat.', conversationId: convo.id });
  } catch (err) {
    console.error('Send invoice error:', err);
    return res.status(500).json({ error: 'Could not send invoice.' });
  }
}

// ------------------------------------------------------------------
// PDF + VERIFICATION
// ------------------------------------------------------------------

export async function getDocumentPdf(req, res) {
  try {
    const found = await loadDocumentWithItems(req.params.id);
    if (!found) return res.status(404).json({ error: 'Document not found.' });
    if (!canAccess(found.document, req.user)) return res.status(403).json({ error: 'You do not have access to this document.' });
    return streamDocumentPdf(res, found);
  } catch (err) {
    console.error('Document PDF error:', err);
    return res.status(500).json({ error: 'Could not generate PDF.' });
  }
}

// Public — no auth required. Scanning a Jedida QR code (or visiting the
// link, or typing the code by hand) lands here.
export async function verifyDocument(req, res) {
  try {
    const { code } = req.params;
    const { result, document } = await documentService.verifyByCode(
      code, req.user?.id || null, req.ip, req.headers['user-agent']
    );
    if (result === 'not_found') {
      return res.status(404).json({ verified: false, message: 'No Jedida transaction matches this code.' });
    }
    return res.json({
      verified: result === 'verified',
      message: result === 'verified' ? 'Verified Jedida Transaction' : 'This document has been voided or cancelled.',
      document: {
        documentNumber: document.document_number,
        documentType: document.document_type,
        totalAmount: document.total_amount,
        currency: document.currency,
        status: document.status,
        issuedAt: document.created_at,
        issuer: document.issuer_snapshot?.name || document.issuer_snapshot?.full_name || null
      }
    });
  } catch (err) {
    console.error('Verify document error:', err);
    return res.status(500).json({ error: 'Could not verify this document.' });
  }
}

export async function raiseDispute(req, res) {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'A reason is required.' });
    const doc = await query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!doc.rows[0]) return res.status(404).json({ error: 'Document not found.' });
    if (!canAccess(doc.rows[0], req.user)) return res.status(403).json({ error: 'You do not have access to this document.' });

    const dispute = await query(
      `INSERT INTO document_disputes (document_id, raised_by, reason) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, reason]
    );
    return res.status(201).json({ message: 'Dispute raised. Admin will review it shortly.', dispute: dispute.rows[0] });
  } catch (err) {
    console.error('Raise dispute error:', err);
    return res.status(500).json({ error: 'Could not raise dispute.' });
  }
}

// ------------------------------------------------------------------
// BUSINESS STATEMENTS
// ------------------------------------------------------------------

export async function generateStatement(req, res) {
  try {
    const { shopId, periodStart, periodEnd } = req.body;
    if (!shopId || !periodStart || !periodEnd) return res.status(400).json({ error: 'shopId, periodStart and periodEnd are required.' });
    const shop = await query('SELECT id FROM shops WHERE id = $1 AND owner_id = $2', [shopId, req.user.id]);
    if (!shop.rows[0]) return res.status(403).json({ error: 'You do not own this shop.' });

    const { document, statement } = await documentService.buildBusinessStatement({
      businessId: req.user.id, shopId, periodStart, periodEnd, generatedBy: req.user.id
    });
    return res.status(201).json({ message: 'Statement generated.', document, statement });
  } catch (err) {
    console.error('Generate statement error:', err);
    return res.status(500).json({ error: 'Could not generate statement.' });
  }
}

export async function myStatements(req, res) {
  try {
    const result = await query('SELECT * FROM business_statements WHERE business_id = $1 ORDER BY period_end DESC', [req.user.id]);
    return res.json({ statements: result.rows });
  } catch (err) {
    console.error('My statements error:', err);
    return res.status(500).json({ error: 'Could not load statements.' });
  }
}

// ------------------------------------------------------------------
// AI INVOICE ASSISTANT
// ------------------------------------------------------------------

export async function aiCreateFromOrder(req, res) {
  try {
    const { orderId, category, notes } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required.' });
    const invoice = await invoiceAi.createInvoiceFromOrder(req.user, orderId, { category, notes });
    return res.status(201).json({ message: 'Invoice created from order.', invoice });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('AI create-from-order error:', err);
    return res.status(500).json({ error: 'Could not create invoice from order.' });
  }
}

export async function aiExplain(req, res) {
  try {
    const found = await loadDocumentWithItems(req.params.id);
    if (!found) return res.status(404).json({ error: 'Document not found.' });
    if (!canAccess(found.document, req.user)) return res.status(403).json({ error: 'You do not have access to this document.' });
    const explanation = await invoiceAi.explainDocument(found.document, found.items);
    return res.json({ explanation });
  } catch (err) {
    console.error('AI explain error:', err);
    return res.status(500).json({ error: 'Could not explain document.' });
  }
}

export async function aiDetectIssues(req, res) {
  try {
    const found = await loadDocumentWithItems(req.params.id);
    if (!found) return res.status(404).json({ error: 'Document not found.' });
    if (!canAccess(found.document, req.user)) return res.status(403).json({ error: 'You do not have access to this document.' });
    const issues = await invoiceAi.detectDocumentIssues(found.document, found.items);
    return res.json({ issues });
  } catch (err) {
    console.error('AI detect-issues error:', err);
    return res.status(500).json({ error: 'Could not check document for mistakes.' });
  }
}

export async function aiSummarizeSales(req, res) {
  try {
    const { since, until } = req.body || {};
    const summary = await invoiceAi.summarizeSales(req.user.id, { since, until });
    return res.json({ summary });
  } catch (err) {
    console.error('AI summarize-sales error:', err);
    return res.status(500).json({ error: 'Could not summarize sales.' });
  }
}

export async function aiMonthlyReport(req, res) {
  try {
    const { year, month } = req.body || {};
    const report = await invoiceAi.generateMonthlyReport(req.user.id, { year, month });
    return res.json({ report });
  } catch (err) {
    console.error('AI monthly report error:', err);
    return res.status(500).json({ error: 'Could not generate monthly report.' });
  }
}
