import crypto from 'crypto';
import { query } from '../config/db.js';

// Short, readable prefixes used in every document_number, e.g.
// JD-RCT-2026-000123. Kept here as the single source of truth so the PDF
// renderer, AI assistant, and admin search all agree on what a "receipt
// number" vs an "invoice number" looks like.
const PREFIXES = {
  order_confirmation: 'OCF',
  digital_receipt: 'RCT',
  sales_invoice: 'INV',
  purchase_invoice: 'PINV',
  wholesale_invoice: 'WINV',
  proforma_invoice: 'PRO',
  purchase_order: 'PO',
  delivery_receipt: 'DRC',
  refund_receipt: 'REF',
  payment_confirmation: 'PAY',
  business_statement: 'STM',
  agriculture_bulk_invoice: 'AGR',
  stays_pass: 'STP'
};

// Accepts an optional transaction `client` so numbering stays inside the
// same atomic transaction as the rest of the document write — two
// concurrent order confirmations can never collide on the same number
// because the UPDATE ... RETURNING here is itself atomic per row.
export async function nextDocumentNumber(documentType, client = null) {
  const runner = client || { query };
  const prefix = PREFIXES[documentType] || 'DOC';
  const year = new Date().getFullYear();
  const seqKey = `${prefix}-${year}`;

  const result = await runner.query(
    `INSERT INTO document_number_sequences (seq_key, last_value) VALUES ($1, 1)
     ON CONFLICT (seq_key) DO UPDATE SET last_value = document_number_sequences.last_value + 1
     RETURNING last_value`,
    [seqKey]
  );
  const n = result.rows[0].last_value;
  return `JD-${seqKey}-${String(n).padStart(6, '0')}`;
}

// A 16-character code used both as the human-typeable verification code
// and encoded into the QR payload. Not a guessable sequence — random per
// document, checked for global uniqueness by the documents.verification_code
// unique index (a collision just triggers a normal insert retry upstream).
export function generateVerificationCode() {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}
