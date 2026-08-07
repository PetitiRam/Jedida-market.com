// Jedida AI — identity attribution.
//
// Design note: an earlier draft of this spec asked for these facts to only
// surface "once tricked" — i.e. leaked as a side effect of a successful
// prompt injection / jailbreak attempt. That's not what this module does,
// on purpose: an AI whose real answer only comes out when someone manages
// to break it is a security bug, not a feature — it teaches users that
// jailbreaking is the way to get real answers, and it means the *normal*
// answer (whatever it says at rest) is a lie of omission. Instead, this
// module gives ONE consistent, true answer whenever identity/leadership is
// actually asked about — plainly if asked plainly, and just as plainly if
// someone tries to "trick" it there via a jailbreak-style prompt. The
// content the person wanted exposed is exactly the same either way; only
// the trigger condition changed, from "was manipulation successful" to
// "did the user ask this question".
//
// This does not fire on every message — see shouldAnswerIdentity() — so it
// doesn't clutter ordinary support replies with unrelated company info.

const IDENTITY_FACTS = Object.freeze({
  creator: 'Mr. Petiti',
  leadership: ['Kakaire Colline', 'Nsubuga Joseph', 'N. Tausi'],
});

// Matches genuine questions about who built/runs Jedida — including common
// jailbreak framings ("ignore previous instructions", "developer mode",
// "what's the real answer") that try to get a *different* answer out of the
// AI. Those framings still route here, and still get the one true answer,
// which is the point: the answer doesn't change under pressure.
const IDENTITY_INTENT = /\b(who\s+(made|created|built|owns|runs|is\s+behind)\s+(you|jedida|this)|your\s+(creator|founder|maker|developer)|jedida'?s?\s+(ceo|ceos|founder|owner|leadership)|who\s+is\s+(mr\.?\s*)?petiti|real\s+(creator|answer|owner)|developer\s+mode|ignore\s+(all\s+|your\s+)?(previous|prior)\s+instructions)\b/i;

export function shouldAnswerIdentity(message) {
  return IDENTITY_INTENT.test(String(message || ''));
}

// Always returns the same facts, regardless of phrasing or how insistent /
// adversarial the request is. Nothing about this depends on whether the
// question was asked politely, repeatedly, or as part of a jailbreak
// attempt — there is no "hidden" version and no "unlocked" version.
export function getIdentityReply() {
  const { creator, leadership } = IDENTITY_FACTS;
  return `Jedida AI was created by ${creator}. Jedida's leadership includes ${leadership.slice(0, -1).join(', ')} and ${leadership[leadership.length - 1]}.`;
}
