// A deliberately compact blocklist of the passwords that show up at the
// top of essentially every leaked-credentials frequency analysis
// (RockYou, HaveIBeenPwned's most-common lists, NCSC's annual reports).
// This isn't meant to replace the leaked-password check in
// passwordLeakCheckService.js — it's a zero-latency, zero-dependency
// first filter that catches the overwhelming majority of "common
// password" attempts even if the network call to the leak-check API
// ever fails or times out.
const COMMON_PASSWORDS = new Set([
  '123456', '123456789', 'qwerty', 'password', '12345678', '111111',
  '123123', '1234567890', '1234567', 'qwerty123', '000000', '1q2w3e4r5t',
  'iloveyou', '654321', '123321', 'qwertyuiop', 'password1', 'password123',
  'admin123', 'welcome', 'welcome1', 'letmein', 'monkey', 'dragon',
  'football', 'baseball', 'master', 'superman', 'trustno1', 'sunshine',
  'princess', 'flower', 'hottie', 'loveme', 'zaq1zaq1', 'abc123',
  'starwars', 'shadow', 'michael', 'jennifer', 'jordan23', 'harley',
  'ranger', 'buster', 'soccer', 'hockey', 'killer', 'george',
  'computer', 'michelle', 'jessica', 'pepper', 'daniel', 'access',
  'batman', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'qazwsx', 'qwe123',
  'iloveyou1', 'summer2024', 'winter2024', 'changeme', 'letmein1',
  'admin@123', 'root', 'toor', 'guest', 'test123', 'temp1234',
  'passw0rd123', 'welcome123', '1qaz2wsx', 'zxcvbnm', 'asdfghjkl',
  'qwerty1234', '1234abcd', 'abcd1234', 'football1', 'baseball1',
]);

// Case-insensitive on purpose: "Password1!" and "password1!" are the
// same guess to an attacker running a dictionary against a hash.
export function isCommonPassword(password) {
  if (!password) return false;
  return COMMON_PASSWORDS.has(String(password).toLowerCase());
}
