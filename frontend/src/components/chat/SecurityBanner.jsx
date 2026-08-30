import Icon from '../icons/icon';

export function SecurityStrip({ onClick }) {
  return (
    <button type="button" className="cw-security-strip" onClick={onClick} style={{ border: 'none', cursor: 'pointer', width: '100%' }}>
      <span className="cw-security-strip-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="checkShield" size={15} /> Protected by Jedida</span>
      <span className="cw-security-checks">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={12} /> Payments protected</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={12} /> Contact sharing blocked</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={12} /> Transaction monitoring active</span>
      </span>
    </button>
  );
}

export function ContactShareWarning({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="cw-warning-card">
      <span style={{ fontSize: '1.1rem', display: 'inline-flex' }}><Icon name="checkShield" size={18} /></span>
      <div>
        <strong>For your protection</strong>
        <p>Keep communication and payments inside Jedida. {message}</p>
      </div>
      <button type="button" className="cw-warning-close" onClick={onClose} aria-label="Dismiss"><Icon name="close" size={14} /></button>
    </div>
  );
}
