const ACTIONS = [
  { key: 'message', icon: '💬', label: 'Message' },
  { key: 'product', icon: '🛍️', label: 'Product' },
  { key: 'quote', icon: '📄', label: 'Request Quote' },
  { key: 'order', icon: '📦', label: 'Order' },
  { key: 'pay', icon: '💳', label: 'Pay' },
  { key: 'support', icon: '🎧', label: 'Support' },
];

export default function BottomActionBar({
  active, onAction, text, onTextChange, onSend, onEmoji, onAttach, disabled
}) {
  return (
    <div className="cw-action-bar">
      <div className="cw-action-chips">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`cw-chip ${active === a.key ? 'active' : ''}`}
            onClick={() => onAction(a.key)}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
      <div className="cw-input-row">
        <button type="button" className="cw-icon-btn" onClick={onEmoji} title="Stickers">😀</button>
        <button type="button" className="cw-icon-btn" onClick={onAttach} title="Attach">📎</button>
        <input
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder="Type a message…"
          disabled={disabled}
        />
        <button type="button" className="cw-send-btn" onClick={onSend} aria-label="Send">↑</button>
      </div>
    </div>
  );
}
