// Renders any `documents` row (+ its line items) into a branded PDF.
// Streamed on demand rather than pre-generated and stored, so it always
// reflects the current status (e.g. "PAID" stamp) without a regeneration
// step. Used by GET /api/documents/:id/pdf.

import PDFDocument from 'pdfkit';

const BRAND_GREEN = '#0F5132';
const MUTED = '#5B6760';
const BORDER = '#D8E0DA';

const TITLES = {
  order_confirmation: 'Order Confirmation',
  digital_receipt: 'Jedida Digital Receipt',
  sales_invoice: 'Sales Invoice',
  purchase_invoice: 'Purchase Invoice',
  wholesale_invoice: 'Wholesale Invoice',
  proforma_invoice: 'Proforma Invoice',
  purchase_order: 'Purchase Order',
  delivery_receipt: 'Delivery Receipt',
  refund_receipt: 'Refund Receipt',
  payment_confirmation: 'Payment Confirmation',
  business_statement: 'Business Statement',
  agriculture_bulk_invoice: 'Agriculture Bulk Invoice'
};

function money(amount, currency) {
  return `${currency || 'USD'} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Writes the PDF straight to an Express response stream.
export function streamDocumentPdf(res, { document, lineItems = [] }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${document.document_number}.pdf"`);
  doc.pipe(res);

  // ---- Header ----
  doc.fillColor(BRAND_GREEN).fontSize(20).font('Helvetica-Bold').text('JEDIDA', 40, 40);
  doc.fillColor(MUTED).fontSize(9).font('Helvetica').text('Trusted marketplace transactions', 40, 62);

  doc.fillColor('#111').fontSize(16).font('Helvetica-Bold')
    .text(TITLES[document.document_type] || 'Document', 40, 90);
  doc.fillColor(MUTED).fontSize(10).font('Helvetica')
    .text(`No. ${document.document_number}`, 40, 112)
    .text(`Issued: ${new Date(document.created_at).toLocaleString()}`, 40, 126);

  if (document.status) {
    doc.fillColor(document.status === 'paid' ? BRAND_GREEN : '#B54708')
      .fontSize(10).font('Helvetica-Bold')
      .text(document.status.replace('_', ' ').toUpperCase(), 400, 90, { align: 'right' });
  }

  doc.moveTo(40, 150).lineTo(555, 150).strokeColor(BORDER).stroke();

  // ---- Parties ----
  const issuer = document.issuer_snapshot || {};
  const recipient = document.recipient_snapshot || {};
  doc.fillColor('#111').fontSize(10).font('Helvetica-Bold').text('From', 40, 165);
  doc.font('Helvetica').fillColor(MUTED)
    .text(issuer.name || issuer.full_name || '—', 40, 180)
    .text(issuer.email || '', 40, 194)
    .text(issuer.phone_number || '', 40, 208);

  doc.fillColor('#111').font('Helvetica-Bold').text('To', 320, 165);
  doc.font('Helvetica').fillColor(MUTED)
    .text(recipient.full_name || recipient.name || '—', 320, 180)
    .text(recipient.email || '', 320, 194)
    .text(recipient.phone_number || '', 320, 208);

  // ---- Line items table ----
  let y = 245;
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(10);
  doc.text('Item', 40, y).text('Qty', 330, y).text('Unit Price', 390, y).text('Total', 480, y);
  y += 16;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(BORDER).stroke();
  y += 8;

  doc.font('Helvetica').fillColor('#333').fontSize(10);
  for (const item of lineItems) {
    if (y > 700) { doc.addPage(); y = 40; }
    doc.text(item.description, 40, y, { width: 270 });
    doc.text(String(item.quantity), 330, y);
    doc.text(money(item.unit_price, document.currency), 390, y);
    doc.text(money(item.line_total, document.currency), 480, y);
    y += 20;
  }

  y += 10;
  doc.moveTo(320, y).lineTo(555, y).strokeColor(BORDER).stroke();
  y += 10;

  const totalsRow = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? '#111' : MUTED).fontSize(10)
      .text(label, 380, y).text(value, 480, y);
    y += 16;
  };
  totalsRow('Subtotal', money(document.subtotal_amount, document.currency));
  if (Number(document.discount_amount) > 0) totalsRow('Discount', `-${money(document.discount_amount, document.currency)}`);
  if (Number(document.tax_amount) > 0) totalsRow('Tax', money(document.tax_amount, document.currency));
  if (Number(document.delivery_fee_amount) > 0) totalsRow('Delivery fee', money(document.delivery_fee_amount, document.currency));
  totalsRow('Total', money(document.total_amount, document.currency), true);

  if (document.payment_method || document.payment_status) {
    y += 6;
    doc.font('Helvetica').fillColor(MUTED).fontSize(9)
      .text(`Payment: ${document.payment_method || ''} ${document.payment_status ? `(${document.payment_status})` : ''}`, 40, y);
  }
  if (document.payment_terms || document.due_date) {
    y += 14;
    doc.text(`Terms: ${document.payment_terms || '—'}${document.due_date ? `  ·  Due ${new Date(document.due_date).toLocaleDateString()}` : ''}`, 40, y);
  }
  if (document.notes) {
    y += 20;
    doc.font('Helvetica-Oblique').fillColor(MUTED).fontSize(9).text(document.notes, 40, y, { width: 515 });
  }

  // ---- Verification footer ----
  const footerY = 730;
  doc.moveTo(40, footerY).lineTo(555, footerY).strokeColor(BORDER).stroke();
  doc.font('Helvetica').fillColor(MUTED).fontSize(8)
    .text(`Verification code: ${document.verification_code}`, 40, footerY + 10)
    .text('Scan the QR code or visit the verification link to confirm this is a genuine Jedida transaction.', 40, footerY + 22, { width: 380 });

  if (document.qr_data_url) {
    try {
      const base64 = document.qr_data_url.split(',')[1];
      doc.image(Buffer.from(base64, 'base64'), 480, footerY - 5, { width: 70, height: 70 });
    } catch {
      // Non-fatal — a missing QR image should never block the PDF itself.
    }
  }

  doc.end();
}
