import crypto from 'crypto';

// HaveIBeenPwned's Pwned Passwords API uses k-anonymity: you send only
// the first 5 characters of the password's SHA-1 hash, and get back
// every suffix that shares that prefix (usually several hundred) along
// with how many times each has appeared in a breach corpus. You then
// check locally whether your full hash's suffix is in that list. The
// full password and full hash never leave this process.
const API_TIMEOUT_MS = 2500;

// Fails open by design: if the API is unreachable, slow, or returns an
// unexpected shape, this returns `{ leaked: false, checked: false }`
// rather than blocking account creation or a password change on a
// third-party dependency being down. `checked` lets a caller distinguish
// "confirmed not leaked" from "we couldn't ask" if that distinction ever
// matters (e.g. for logging).
export async function checkPasswordLeaked(password) {
  if (!password) return { leaked: false, checked: false };

  const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: { 'Add-Padding': 'true' }, // API-recommended: response includes decoy suffixes so response size can't leak info either
    });
    if (!response.ok) return { leaked: false, checked: false };

    const body = await response.text();
    for (const line of body.split('\n')) {
      const [lineSuffix, count] = line.trim().split(':');
      if (lineSuffix === suffix) {
        return { leaked: true, checked: true, count: Number(count) || 0 };
      }
    }
    return { leaked: false, checked: true };
  } catch (err) {
    // Network error, timeout, or DNS failure — fail open.
    return { leaked: false, checked: false };
  } finally {
    clearTimeout(timeout);
  }
}
