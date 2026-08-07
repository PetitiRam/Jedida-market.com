// Guards the AI Training Center pipeline against sensitive or harmful
// content reaching the Jedida AI. This is a defense-in-depth check on top
// of the workflow itself (Draft -> Review -> Admin Approval -> AI Indexing):
// content is scanned every time it tries to move to 'in_review' or
// 'approved', not just once at upload.
//
// This is a pattern-based safety net, not a substitute for human review —
// admins are still the ones who approve knowledge, and are expected to read
// what they approve.

const SENSITIVE_PATTERNS = [
  { name: 'possible credit/debit card number', regex: /\b(?:\d[ -]?){13,16}\b/ },
  { name: 'password or credential field', regex: /\b(password|passwd|pwd|api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*\S+/i },
  { name: 'private key material', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'possible national ID / passport number', regex: /\b(national\s?id|passport)\s*(no\.?|number)?\s*[:#]?\s*[A-Z0-9]{6,12}\b/i },
  { name: 'possible bank account number', regex: /\b(account|acct)\s*(no\.?|number)?\s*[:#]?\s*\d{8,}\b/i },
  { name: 'raw phone/PIN combo suggestive of personal account access', regex: /\bpin\s*[:=]\s*\d{4,6}\b/i },
];

const HARMFUL_KEYWORDS = [
  'how to bypass kyc', 'fake id', 'launder money', 'how to scam', 'chargeback fraud',
];

/**
 * Scans a piece of proposed knowledge content. Returns { clean, flags }.
 * flags is a list of human-readable reasons — surfaced to the admin so they
 * know exactly what to fix, never silently stripped.
 */
export function scanKnowledgeContent(text = '') {
  const flags = [];
  const sample = String(text || '');

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.regex.test(sample)) flags.push(pattern.name);
  }
  const lower = sample.toLowerCase();
  for (const kw of HARMFUL_KEYWORDS) {
    if (lower.includes(kw)) flags.push(`potentially harmful instruction ("${kw}")`);
  }

  return { clean: flags.length === 0, flags };
}

// Collections/source types that structurally can never come from a private
// conversation — used to double-check controller inputs stay inside the
// allowed vocabulary defined in schema_phase49.
export const ALLOWED_COLLECTIONS = [
  'general_marketplace', 'agriculture', 'manufacturing', 'suppliers',
  'wholesale', 'delivery', 'payments', 'seller_success', 'buyer_support',
  'admin_operations',
];

export const ALLOWED_SOURCE_TYPES = [
  'help_article', 'documentation', 'product_catalog', 'policy', 'faq',
  'training_manual', 'seller_guide', 'agriculture_knowledge', 'wholesale_doc',
  'delivery_procedure', 'support_correction', 'other',
];
