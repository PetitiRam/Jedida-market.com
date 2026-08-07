// Petiti AI — Chat Contact & Fraud Moderation Engine
//
// Runs on every chat message BEFORE it is persisted/broadcast. Detects
// attempts to move the conversation off-platform (phone numbers, emails,
// social/messaging handles, external links, off-platform meeting requests,
// off-platform payment requests) as well as basic scam/harassment signals.
//
// Verified administrators and official Jedida support accounts are exempt
// (see isExemptSender) — official contact/payment info they share is never
// masked or blocked, per the marketplace's admin exception policy.

import { query } from '../config/db.js';
import { createAlert, log } from '../../ai/petiti/petitiService.js';
import { logSecurityEvent } from '../services/securityLogService.js';

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

// Phone numbers: international/local formats, with or without separators,
// including "call me on", "o8i2..." digit-letter substitution tricks handled
// by a secondary normalized-digit pass below.
const PHONE_RE = /(?:\+?\d[\d\s\-().]{6,}\d)/g;

// A lone run of 7+ digits (with common obfuscating separators stripped)
// still counts as a phone number even if it didn't match the looser pattern.
const DIGIT_RUN_RE = /\d[\d\s\-.]{6,}\d/g;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-zA-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[a-zA-Z]{2,}/gi;

const EXTERNAL_LINK_RE = /(https?:\/\/|www\.)[^\s]+/gi;

// Platform/handle mentions: "whatsapp me", "@handle", "wa.me/...", "t.me/...",
// "IG: name", "snap me at ...", "discord: name#1234", etc.
const SOCIAL_PATTERNS = [
  { name: 'whatsapp', re: /\b(whats\s*app|wa\.me|w[\s.]?a[\s.]?)\b/gi },
  // A bare '@handle' is too ambiguous on its own — it matched any
  // 4+ character @mention regardless of platform, flagging plenty of
  // messages that had nothing to do with Telegram. Keeping only the
  // unambiguous signals (the word "telegram", "tg:"/"tg@", or a t.me
  // link) trades a little recall on disguised handles for a much lower
  // false-positive rate; phone/email/link detection still catches the
  // actual contact info in those messages regardless.
  { name: 'telegram', re: /\b(telegram|t\.me|tg\s*[:@]\s*[a-z0-9_]{3,})\b/gi },
  { name: 'facebook', re: /\b(facebook|fb\.com|fb\.me)\b/gi },
  { name: 'instagram', re: /\b(instagram|insta\s?gram|ig\s*[:@])\b/gi },
  { name: 'tiktok', re: /\btik\s?tok\b/gi },
  { name: 'twitter_x', re: /\b(twitter|x\.com)\b/gi },
  { name: 'snapchat', re: /\bsnap\s?chat\b/gi },
  // Real Discord tags are `username#1234` with no space before the '#' —
  // a bare '#1234' (e.g. "order #1234", "ticket #5678") was matching
  // before and getting flagged as a Discord handle. Requiring an adjacent
  // handle-like token immediately before the '#' fixes that false positive
  // while still catching the actual tag format.
  { name: 'discord', re: /\bdiscord\b|\b[a-z0-9_]{2,32}#\d{4}\b/gi },
  { name: 'wechat', re: /\bwe\s?chat\b/gi },
  { name: 'imo_viber_signal', re: /\b(imo|viber|signal app)\b/gi },
];

const MEETING_KEYWORDS_RE = /\b(meet\s+me|meet\s+up|in\s+person|come\s+to\s+my\s+(house|home|shop|office)|let'?s\s+meet\s+outside|meet\s+outside\s+the\s+app|cash\s+on\s+delivery\s+in\s+person)\b/gi;

const OFF_PLATFORM_PAYMENT_RE = /\b(pay\s+me\s+directly|send\s+(money|cash)\s+(to|via)\s+(my\s+)?(mpesa|momo|mobile\s?money|bank|paypal|zelle|cashapp|venmo)|western\s+union|moneygram|off[\s-]?platform\s+payment|pay\s+outside\s+(the\s+)?(app|platform|jedida))\b/gi;

// Generic requests to take the conversation off Jedida entirely — distinct
// from a specific platform mention (SOCIAL_PATTERNS) or a payment/meeting
// request: "let's talk elsewhere", "chat outside jedida", "leave this app",
// "continue this conversation outside the platform", etc. Per the Stage 5
// spec: "Messages asking users to leave Jedida."
const LEAVE_PLATFORM_RE = /\b(talk\s+(to\s+me\s+)?(elsewhere|somewhere\s+else)|chat\s+(with\s+me\s+)?(elsewhere|outside\s+(jedida|the\s+app|this\s+app|the\s+platform))|leave\s+(jedida|this\s+app|the\s+app|the\s+platform)|get\s+off\s+(jedida|this\s+app|the\s+platform)|continue\s+(this\s+)?(chat|conversation)\s+outside|move\s+(this\s+)?(chat|conversation)\s+(off|outside)|contact\s+me\s+(outside|off)\s+(jedida|the\s+app|this\s+app|the\s+platform)|reach\s+me\s+(directly|outside\s+jedida))\b/gi;

// Light obfuscation normalizer: "z e r o s e v e n..." / "seven-nine-two" style
// spelled-out digits, common in scam attempts to dodge digit-based filters.
const WORD_DIGITS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9', oh: '0',
};

function countSpelledDigits(text) {
  const words = text.toLowerCase().split(/[\s,\-]+/);
  let run = 0;
  let maxRun = 0;
  for (const w of words) {
    if (WORD_DIGITS[w] !== undefined) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  return maxRun;
}

// ---------------------------------------------------------------------------
// Core scan
// ---------------------------------------------------------------------------

// Returns { violations: [{type, category, severity, matches}], maskedText, riskDelta }
export function scanMessageText(rawText) {
  const text = String(rawText || '');
  const violations = [];
  let maskedText = text;

  const maskAll = (re, category, type, severity) => {
    const matches = text.match(re);
    if (matches && matches.length) {
      violations.push({ type, category, severity, matches: matches.slice(0, 5) });
      maskedText = maskedText.replace(re, (m) => '*'.repeat(Math.min(m.length, 12)));
    }
  };

  maskAll(EMAIL_RE, 'contact_info', 'email', 'high');
  maskAll(PHONE_RE, 'contact_info', 'phone_number', 'high');
  maskAll(EXTERNAL_LINK_RE, 'contact_info', 'external_link', 'high');

  for (const { name, re } of SOCIAL_PATTERNS) {
    maskAll(re, 'contact_info', `social_${name}`, 'medium');
  }

  maskAll(MEETING_KEYWORDS_RE, 'off_platform_meeting', 'meeting_request', 'medium');
  maskAll(OFF_PLATFORM_PAYMENT_RE, 'off_platform_payment', 'payment_diversion', 'high');
  maskAll(LEAVE_PLATFORM_RE, 'leave_platform', 'leave_platform_request', 'high');

  if (countSpelledDigits(text) >= 7) {
    violations.push({ type: 'spelled_out_number', category: 'contact_info', severity: 'medium', matches: [] });
  }

  // Fallback: a bare long digit run that the phone regex's punctuation
  // requirements missed (e.g. "0788123456" with no separators at all).
  const digitRuns = text.match(DIGIT_RUN_RE) || [];
  for (const run of digitRuns) {
    const digitsOnly = run.replace(/\D/g, '');
    if (digitsOnly.length >= 7 && !violations.some((v) => v.type === 'phone_number')) {
      violations.push({ type: 'phone_number', category: 'contact_info', severity: 'high', matches: [run] });
      maskedText = maskedText.replace(run, '*'.repeat(Math.min(run.length, 12)));
    }
  }

  const highest = violations.reduce((acc, v) => Math.max(acc, v.severity === 'high' ? 3 : v.severity === 'medium' ? 2 : 1), 0);
  const action = highest >= 3 ? 'block' : highest === 2 ? 'mask' : 'allow';
  const riskDelta = violations.length ? Math.min(10 + violations.length * 5, 40) : 0;

  return { violations, maskedText, action, riskDelta, clean: violations.length === 0 };
}

// ---------------------------------------------------------------------------
// Admin exception
// ---------------------------------------------------------------------------

// Verified admins and official Jedida support accounts may freely share
// official contact/payment info. `user` is the socket/req auth payload
// ({ id, isAdmin, adminRole }).
export function isExemptSender(user) {
  return Boolean(user?.isAdmin);
}

// ---------------------------------------------------------------------------
// Persistence / risk scoring / admin notification
// ---------------------------------------------------------------------------

export async function recordModerationEvent({ conversationId, messageId, userId, result }) {
  if (!result.violations.length) return null;

  await query(
    `INSERT INTO chat_moderation_events (conversation_id, message_id, user_id, action, categories, details)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      conversationId,
      messageId,
      userId,
      result.action,
      JSON.stringify([...new Set(result.violations.map((v) => v.category))]),
      JSON.stringify(result.violations),
    ]
  );

  // "Reduce trust score if repeated" — a first-time slip costs the base
  // riskDelta from the scan itself; from the 2nd attempt in a rolling
  // 7-day window onward, an extra penalty is added on top, so the score
  // drops faster the more a user repeats the behavior rather than at a
  // flat rate every time.
  const countResult = await query(
    `SELECT COUNT(*) FROM chat_moderation_events WHERE user_id = $1 AND created_at > now() - interval '7 days'`,
    [userId]
  );
  const recentViolations = Number(countResult.rows[0].count); // includes the row just inserted
  const repeatPenalty = recentViolations >= 2 ? Math.min((recentViolations - 1) * 5, 25) : 0;

  const updated = await query(
    `UPDATE users SET chat_risk_score = LEAST(chat_risk_score + $2, 100) WHERE id = $1 RETURNING chat_risk_score`,
    [userId, result.riskDelta + repeatPenalty]
  );
  const newScore = updated.rows[0]?.chat_risk_score ?? 0;

  await log('petiti', result.action === 'block' ? 'warning' : 'info', 'chat_moderation',
    `Contact-sharing attempt (${result.violations.map((v) => v.type).join(', ')}) in conversation ${conversationId}.`,
    { userId, conversationId, messageId, action: result.action });

  // Also lands in the platform-wide security timeline (schema_phase43),
  // alongside product/price/verification events and Stage 4's AI Handler
  // log — "Record security event" from the spec, on the same unified
  // write path admin's Security Center already reads.
  await logSecurityEvent(null, {
    actorId: userId, actorRole: 'user', eventType: 'chat_contact_violation',
    entityType: 'chat_conversation', entityId: conversationId,
    metadata: {
      messageId, action: result.action, recentViolations, repeatPenalty,
      categories: [...new Set(result.violations.map((v) => v.category))],
    },
  });

  // Escalate to admins once a user's cumulative risk crosses the threshold,
  // or immediately on a block-worthy attempt (payment diversion / repeated).
  if (newScore >= 60 || recentViolations >= 3) {
    await createAlert({
      actor: 'petiti',
      severity: newScore >= 85 ? 'critical' : 'high',
      title: 'Repeated contact-sharing attempts in chat',
      description: `User has ${recentViolations} contact-sharing/off-platform attempts in the last 7 days (risk score ${newScore}).`,
      relatedUserId: userId,
      metadata: { conversationId, recentViolations, riskScore: newScore },
    });
  }

  return { riskScore: newScore, recentViolations, repeatPenalty };
}

export async function getChatRiskScore(userId) {
  const result = await query('SELECT chat_risk_score FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.chat_risk_score ?? 0;
}

// The exact standing reminder from the Stage 5 spec — shown persistently
// (not just when something is masked/blocked) so buyers and businesses see
// it before anything goes wrong, not only after. Used by chatV2.js/
// chatSocket.js wherever a conversation is opened or listed.
export const ORDER_PROTECTION_REMINDER = 'Keep all communication and payments inside Jedida for buyer protection.';

// Friendly, non-repetitive reminder text shown to the sender when a message
// is masked or blocked — this is the "Petiti AI ... politely reminds users"
// requirement from the spec.
export function buildReminderMessage(result) {
  const categories = new Set(result.violations.map((v) => v.category));
  if (categories.has('off_platform_payment')) {
    return `For your safety, payments must stay inside Jedida Marketplace — please use the order's official payment flow instead of sharing outside payment details. ${ORDER_PROTECTION_REMINDER}`;
  }
  if (categories.has('leave_platform')) {
    return `For everyone's protection, this conversation needs to stay inside Jedida — Jedida chat, orders, and payments only work when everything happens on-platform. ${ORDER_PROTECTION_REMINDER}`;
  }
  if (categories.has('off_platform_meeting')) {
    return "To keep both of you protected, please arrange delivery and meetups through Jedida Marketplace's order and delivery tools rather than off-platform.";
  }
  return `For everyone's safety, personal contact details (phone numbers, emails, social/messaging handles, external links) can't be shared in chat. ${ORDER_PROTECTION_REMINDER}`;
}
