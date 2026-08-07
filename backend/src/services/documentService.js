// Central engine behind every trusted document Jedida issues — order
// confirmations, digital receipts, every invoice flavor, delivery
// receipts, refund receipts, payment confirmations, and business
// statements. This is NOT a separate accounting system: every document
// hangs off the existing orders/payments/shops/users tables, and this
// file is the only place that knows how to build one.

import { query } from '../config/db.js';
import { nextDocumentNumber, generateVerificationCode } from './documentNumberService.js';
import { generateQrDataUrl } from './qrService.js';

function run(client, text, params) {
  return client ? client.query(text, params) : query(text, params);
}

// Snapshot helpers — a document must keep reading correctly even if the
// shop is renamed or the user edits their profile afterward.
function shopSnapshot(shop) {
  if (!shop) return {};
  return {
    name: shop.name,
    logo_url: shop.logo_url,
    slug: shop.slug
  };
}
function userSnapshot(user) {
  if (!user) return {};
  return {
    full_name: user.full_name,
    email: user.email,
    phone_number: user.phone_number,
    location_city: user.location_city,
    location_country: user.location_country
  };
}

// Inserts the documents row (+ invoices row + line items) that every
// specific document type below builds on top of. Returns the full row
// plus its QR/verification info.
async function insertDocument(client, {
  documentType, status = 'issued', orderId = null, checkoutGroupId = null,
  quoteRequestId = null, supplyContractId = null, shopId = null,
  issuerId = null, recipientId = null, issuerSnapshot = {}, recipientSnapshot = {},
  currency = 'USD', subtotalAmount = 0, discountAmount = 0, taxAmount = 0,
  deliveryFeeAmount = 0, totalAmount = 0, paymentMethod = null, paymentStatus = null,
  paymentTerms = null, dueDate = null, notes = null, signatureUrl = null,
  isManual = false, duplicatedFromId = null, createdBy = null, metadata = {},
  invoiceCategory = null, buyerBusinessName = null, lineItems = []
}) {
  const documentNumber = await nextDocumentNumber(documentType, client);
  const verificationCode = generateVerificationCode();
  const qrDataUrl = await generateQrDataUrl(verificationCode);

  const inserted = await run(client,
    `INSERT INTO documents (
       document_number, document_type, status, order_id, checkout_group_id,
       quote_request_id, supply_contract_id, shop_id, issuer_id, recipient_id,
       issuer_snapshot, recipient_snapshot, currency, subtotal_amount, discount_amount,
       tax_amount, delivery_fee_amount, total_amount, payment_method, payment_status,
       payment_terms, due_date, notes, signature_url, verification_code, qr_data_url,
       is_manual, duplicated_from_id, created_by, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               $21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
     RETURNING *`,
    [
      documentNumber, documentType, status, orderId, checkoutGroupId,
      quoteRequestId, supplyContractId, shopId, issuerId, recipientId,
      JSON.stringify(issuerSnapshot), JSON.stringify(recipientSnapshot), currency, subtotalAmount, discountAmount,
      taxAmount, deliveryFeeAmount, totalAmount, paymentMethod, paymentStatus,
      paymentTerms, dueDate, notes, signatureUrl, verificationCode, qrDataUrl,
      isManual, duplicatedFromId, createdBy, JSON.stringify(metadata)
    ]
  );
  const doc = inserted.rows[0];

  const isInvoiceLike = documentType.includes('invoice') || documentType === 'purchase_order';
  if (isInvoiceLike) {
    await run(client,
      `INSERT INTO invoices (id, invoice_category, buyer_business_name) VALUES ($1,$2,$3)`,
      [doc.id, invoiceCategory || 'retail', buyerBusinessName]
    );
  }

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const lineTotal = item.lineTotal ?? Number(item.quantity) * Number(item.unitPrice);
    await run(client,
      `INSERT INTO document_line_items (document_id, product_id, description, quantity, unit, unit_price, line_total, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [doc.id, item.productId || null, item.description, item.quantity, item.unit || null, item.unitPrice, lineTotal, i]
    );
  }

  return doc;
}

// ---------------------------------------------------------------------
// ORDER-DRIVEN DOCUMENTS (auto-generated — hooked into ordersController)
// ---------------------------------------------------------------------

// Loads everything needed to describe a single order: buyer, seller/shop,
// product. Shared by every order-driven document builder below.
async function loadOrderContext(client, orderId) {
  const result = await run(client,
    `SELECT o.*, p.title AS product_title, p.sku AS product_sku,
            s.name AS shop_name, s.logo_url AS shop_logo_url, s.slug AS shop_slug, s.owner_id AS seller_id,
            b.full_name AS buyer_name, b.email AS buyer_email, b.phone_number AS buyer_phone,
            b.location_city AS buyer_city, b.location_country AS buyer_country,
            sl.full_name AS seller_name, sl.email AS seller_email, sl.phone_number AS seller_phone
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN shops s ON s.id = o.shop_id
     JOIN users b ON b.id = o.buyer_id
     JOIN users sl ON sl.id = s.owner_id
     WHERE o.id = $1`,
    [orderId]
  );
  return result.rows[0] || null;
}

// Order Confirmation — issued the moment an order is created (still
// pending_payment). Purely informational, no payment fields.
export async function createOrderConfirmation(orderId, client = null) {
  const o = await loadOrderContext(client, orderId);
  if (!o) return null;
  return insertDocument(client, {
    documentType: 'order_confirmation',
    orderId: o.id, shopId: o.shop_id, issuerId: o.seller_id, recipientId: o.buyer_id,
    issuerSnapshot: { name: o.shop_name, logo_url: o.shop_logo_url, slug: o.shop_slug },
    recipientSnapshot: { full_name: o.buyer_name, email: o.buyer_email, phone_number: o.buyer_phone },
    currency: o.currency, subtotalAmount: Number(o.unit_price) * o.quantity, totalAmount: o.total_amount,
    notes: 'Order received. Awaiting payment confirmation.',
    lineItems: [{ productId: o.product_id, description: o.product_title, quantity: o.quantity, unitPrice: o.unit_price }]
  });
}

// Digital Receipt — issued right after payment succeeds and funds move
// into escrow. This is the customer-facing "Jedida Digital Receipt".
export async function createDigitalReceipt(orderId, { paymentMethod = null } = {}, client = null) {
  const o = await loadOrderContext(client, orderId);
  if (!o) return null;
  const subtotal = Number(o.unit_price) * o.quantity;
  return insertDocument(client, {
    documentType: 'digital_receipt',
    orderId: o.id, shopId: o.shop_id, issuerId: o.seller_id, recipientId: o.buyer_id,
    issuerSnapshot: { name: o.shop_name, logo_url: o.shop_logo_url, slug: o.shop_slug },
    recipientSnapshot: { full_name: o.buyer_name, email: o.buyer_email, phone_number: o.buyer_phone },
    currency: o.currency, subtotalAmount: subtotal, taxAmount: 0,
    discountAmount: 0, deliveryFeeAmount: Number(o.total_amount) - subtotal - Number(o.platform_fee_amount || 0) > 0
      ? 0 : 0,
    totalAmount: o.total_amount, paymentMethod, paymentStatus: 'succeeded',
    notes: 'Payment received and held safely in Jedida escrow until delivery is confirmed.',
    lineItems: [{ productId: o.product_id, description: o.product_title, quantity: o.quantity, unitPrice: o.unit_price }]
  });
}

// Payment Confirmation — a lighter-weight document confirming money moved
// (escrow credit at checkout, or payout to the seller on release).
export async function createPaymentConfirmation(orderId, { direction, amount, note, recipientId, issuerId }, client = null) {
  const o = await loadOrderContext(client, orderId);
  if (!o) return null;
  return insertDocument(client, {
    documentType: 'payment_confirmation',
    orderId: o.id, shopId: o.shop_id,
    issuerId: issuerId || null, recipientId: recipientId || o.buyer_id,
    currency: o.currency, totalAmount: amount, paymentStatus: direction,
    notes: note || 'Payment confirmation.',
    metadata: { direction }
  });
}

// Delivery Receipt — issued once every party has confirmed delivery.
export async function createDeliveryReceipt(orderId, client = null) {
  const o = await loadOrderContext(client, orderId);
  if (!o) return null;
  return insertDocument(client, {
    documentType: 'delivery_receipt',
    orderId: o.id, shopId: o.shop_id, issuerId: o.seller_id, recipientId: o.buyer_id,
    issuerSnapshot: { name: o.shop_name, logo_url: o.shop_logo_url },
    recipientSnapshot: { full_name: o.buyer_name, phone_number: o.buyer_phone },
    currency: o.currency, totalAmount: o.total_amount,
    notes: 'All parties confirmed delivery for this order.',
    lineItems: [{ productId: o.product_id, description: o.product_title, quantity: o.quantity, unitPrice: o.unit_price }]
  });
}

// Refund Receipt — issued whenever an order is refunded (admin refund or
// auto-release-triggered cancellation).
export async function createRefundReceipt(orderId, reason, client = null) {
  const o = await loadOrderContext(client, orderId);
  if (!o) return null;
  return insertDocument(client, {
    documentType: 'refund_receipt',
    orderId: o.id, shopId: o.shop_id, issuerId: o.seller_id, recipientId: o.buyer_id,
    issuerSnapshot: { name: o.shop_name, logo_url: o.shop_logo_url },
    recipientSnapshot: { full_name: o.buyer_name, email: o.buyer_email },
    currency: o.currency, totalAmount: o.total_amount, paymentStatus: 'refunded',
    notes: reason || 'Order refunded.',
    lineItems: [{ productId: o.product_id, description: o.product_title, quantity: o.quantity, unitPrice: o.unit_price }]
  });
}

// ---------------------------------------------------------------------
// MANUAL / BUSINESS INVOICES (Invoice System + Wholesale/Agriculture)
// ---------------------------------------------------------------------

const INVOICE_TYPE_BY_CATEGORY = {
  retail: 'sales_invoice',
  wholesale: 'wholesale_invoice',
  supplier: 'purchase_invoice',
  manufacturer: 'purchase_invoice',
  agriculture_bulk: 'agriculture_bulk_invoice',
  proforma: 'proforma_invoice',
  purchase_order: 'purchase_order'
};

// A business (seller/manufacturer/supplier/farmer) creating an invoice by
// hand — retail, wholesale, supplier, manufacturer, agriculture bulk,
// proforma quotation, or a purchase order.
export async function createManualInvoice(issuerUser, payload) {
  const {
    category = 'retail', recipientId = null, buyerBusinessName = null,
    orderId = null, quoteRequestId = null, supplyContractId = null, shopId = null,
    currency = 'USD', discountAmount = 0, taxAmount = 0, deliveryFeeAmount = 0,
    paymentTerms = null, dueDate = null, notes = null, signatureUrl = null,
    items = []
  } = payload;

  if (!items.length) {
    const err = new Error('An invoice needs at least one line item.');
    err.code = 'NO_ITEMS';
    throw err;
  }

  const subtotal = items.reduce((sum, it) => sum + Number(it.quantity) * Number(it.unitPrice), 0);
  const total = subtotal - Number(discountAmount) + Number(taxAmount) + Number(deliveryFeeAmount);

  let recipientSnapshot = {};
  if (recipientId) {
    const r = await query('SELECT full_name, email, phone_number FROM users WHERE id = $1', [recipientId]);
    recipientSnapshot = userSnapshot(r.rows[0]);
  }
  let issuerSnapshot = userSnapshot(issuerUser);
  if (shopId) {
    const s = await query('SELECT name, logo_url, slug FROM shops WHERE id = $1', [shopId]);
    if (s.rows[0]) issuerSnapshot = { ...issuerSnapshot, ...shopSnapshot(s.rows[0]) };
  }

  return insertDocument(null, {
    documentType: INVOICE_TYPE_BY_CATEGORY[category] || 'sales_invoice',
    status: 'draft',
    orderId, quoteRequestId, supplyContractId, shopId,
    issuerId: issuerUser.id, recipientId,
    issuerSnapshot, recipientSnapshot,
    currency, subtotalAmount: subtotal, discountAmount, taxAmount, deliveryFeeAmount, totalAmount: total,
    paymentTerms, dueDate, notes, signatureUrl,
    isManual: true, createdBy: issuerUser.id,
    invoiceCategory: category, buyerBusinessName,
    lineItems: items.map((it) => ({
      productId: it.productId || null, description: it.description, quantity: it.quantity,
      unit: it.unit || null, unitPrice: it.unitPrice
    }))
  });
}

export async function duplicateInvoice(documentId, issuerUser) {
  const doc = await query('SELECT * FROM documents WHERE id = $1 AND issuer_id = $2', [documentId, issuerUser.id]);
  if (!doc.rows[0]) return null;
  const invoiceRow = await query('SELECT * FROM invoices WHERE id = $1', [documentId]);
  const items = await query('SELECT * FROM document_line_items WHERE document_id = $1 ORDER BY sort_order', [documentId]);
  const original = doc.rows[0];

  const created = await insertDocument(null, {
    documentType: original.document_type,
    status: 'draft',
    orderId: null, checkoutGroupId: null, quoteRequestId: original.quote_request_id,
    supplyContractId: original.supply_contract_id, shopId: original.shop_id,
    issuerId: original.issuer_id, recipientId: original.recipient_id,
    issuerSnapshot: original.issuer_snapshot, recipientSnapshot: original.recipient_snapshot,
    currency: original.currency, subtotalAmount: original.subtotal_amount, discountAmount: original.discount_amount,
    taxAmount: original.tax_amount, deliveryFeeAmount: original.delivery_fee_amount, totalAmount: original.total_amount,
    paymentTerms: original.payment_terms, dueDate: original.due_date, notes: original.notes,
    isManual: true, duplicatedFromId: original.id, createdBy: issuerUser.id,
    invoiceCategory: invoiceRow.rows[0]?.invoice_category || 'retail',
    buyerBusinessName: invoiceRow.rows[0]?.buyer_business_name || null,
    lineItems: items.rows.map((it) => ({
      productId: it.product_id, description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unit_price
    }))
  });
  return created;
}

// ---------------------------------------------------------------------
// BUSINESS STATEMENTS
// ---------------------------------------------------------------------

export async function buildBusinessStatement({ businessId, shopId, periodStart, periodEnd, generatedBy }) {
  const stats = await query(
    `SELECT COUNT(*)::int AS total_orders,
            COALESCE(SUM(total_amount),0) AS total_sales,
            COALESCE(SUM(platform_fee_amount),0) AS total_fees,
            COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_amount ELSE 0 END),0) AS total_refunds
     FROM orders
     WHERE shop_id = $1 AND created_at BETWEEN $2 AND $3`,
    [shopId, periodStart, periodEnd]
  );
  const s = stats.rows[0];
  const netEarnings = Number(s.total_sales) - Number(s.total_fees) - Number(s.total_refunds);

  const doc = await insertDocument(null, {
    documentType: 'business_statement',
    shopId, issuerId: businessId, recipientId: businessId,
    currency: 'USD', subtotalAmount: s.total_sales, totalAmount: netEarnings,
    notes: `Business statement for ${periodStart} to ${periodEnd}.`,
    createdBy: generatedBy, metadata: { periodStart, periodEnd }
  });

  const statement = await query(
    `INSERT INTO business_statements (document_id, business_id, shop_id, period_start, period_end, total_orders, total_sales, total_fees, total_refunds, net_earnings, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [doc.id, businessId, shopId, periodStart, periodEnd, s.total_orders, s.total_sales, s.total_fees, s.total_refunds, netEarnings, generatedBy]
  );
  return { document: doc, statement: statement.rows[0] };
}

// ---------------------------------------------------------------------
// VERIFICATION
// ---------------------------------------------------------------------

export async function verifyByCode(code, scannedBy = null, ip = null, userAgent = null) {
  const doc = await query('SELECT * FROM documents WHERE verification_code = $1', [code]);
  const result = doc.rows[0]
    ? (doc.rows[0].status === 'void' || doc.rows[0].status === 'cancelled' ? 'void' : 'verified')
    : 'not_found';

  await query(
    `INSERT INTO document_verification_scans (document_id, verification_code, result, scanned_by, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [doc.rows[0]?.id || null, code, result, scannedBy, ip, userAgent]
  );

  return { result, document: doc.rows[0] || null };
}
