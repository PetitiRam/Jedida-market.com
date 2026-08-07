export function SecurityStrip({ onClick }) {
  return (
    <button type="button" className="cw-security-strip" onClick={onClick} style={{ border: 'none', cursor: 'pointer', width: '100%' }}>
      <span className="cw-security-strip-title">🛡️ Protected by Jedida</span>
      <span className="cw-security-checks">
        <span>✓ Payments protected</span>
        <span>✓ Contact sharing blocked</span>
        <span>✓ Transaction monitoring active</span>
      </span>
    </button>
  );
}

export function ContactShareWarning({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="cw-warning-card">
      <span style={{ fontSize: '1.1rem' }}>🛡️</span>
      <div>
        <strong>For your protection</strong>
        <p>Keep communication and payments inside Jedida. {message}</p>
      </div>
      <button type="button" className="cw-warning-close" onClick={onClose}>✕</button>
    </div>
  );
}
