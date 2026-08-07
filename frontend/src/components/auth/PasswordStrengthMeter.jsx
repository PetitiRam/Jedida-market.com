function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
}

const LEVELS = [
  { key: 'weak', label: 'Weak' },
  { key: 'fair', label: 'Fair' },
  { key: 'good', label: 'Good' },
  { key: 'strong', label: 'Strong' },
];

export default function PasswordStrengthMeter({ password }) {
  const score = scorePassword(password);
  const level = LEVELS[Math.max(score - 1, 0)];

  return (
    <div className="jd-strength" aria-hidden={!password}>
      <div className="jd-strength-track">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`jd-strength-seg ${i < score ? `on-${level.key}` : ''}`}
          />
        ))}
      </div>
      <span className="jd-strength-label">{password ? level.label : ''}</span>
    </div>
  );
}
