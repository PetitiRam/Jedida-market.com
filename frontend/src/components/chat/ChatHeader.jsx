const ROLE_LABELS = {
  manufacturer: 'Manufacturer',
  supplier: 'Supplier',
  seller: 'Seller',
  dropshipper: 'Dropshipper',
  buyer: 'Buyer',
  delivery: 'Delivery Partner',
};

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export default function ChatHeader({
  participant, isOnline, onViewStore, onReport, onSecurity, onTogglePanel, hasPanel
}) {
  const name = participant?.shop?.name || participant?.fullName || 'Jedida user';
  const roleLabel = participant ? (ROLE_LABELS[participant.role] || 'Buyer') : '—';
  const score = participant?.trustScore ?? 0;

  return (
    <div className="cw-header">
      <div className="cw-header-top">
        <div className="cw-avatar-wrap">
          <div className="cw-trust-ring" style={{ '--cw-score': score }}>
            {participant?.avatarUrl || participant?.shop?.logoUrl ? (
              <img className="cw-avatar" src={participant.shop?.logoUrl || participant.avatarUrl} alt={name} />
            ) : (
              <div className="cw-avatar-fallback">{initials(name)}</div>
            )}
          </div>
          <span className={`cw-online-dot ${isOnline ? '' : 'offline'}`} title={isOnline ? 'Online now' : 'Offline'} />
        </div>

        <div className="cw-header-info">
          <div className="cw-header-name-row">
            <span className="cw-header-name">{name}</span>
            {participant?.isVerified && (
              <span className="cw-verified-badge">✓ Verified {roleLabel}</span>
            )}
          </div>
          <div className="cw-header-meta-row">
            {!participant?.isVerified && <span className="cw-business-type">{roleLabel}</span>}
            <span className="cw-trust-pill">● Trust Score {score}%</span>
            {participant?.rating?.average && (
              <span>★ {participant.rating.average.toFixed(1)} ({participant.rating.count})</span>
            )}
          </div>
          <div className="cw-security-line">🔒 Secure Jedida Chat</div>
        </div>

        {hasPanel && (
          <button type="button" className="cw-header-action-btn" onClick={onTogglePanel} title="Business panel">
            ☰
          </button>
        )}
      </div>

      <div className="cw-header-actions">
        {participant?.shop && (
          <button type="button" className="cw-header-action-btn primary" onClick={onViewStore}>🏬 View Store</button>
        )}
        <button type="button" className="cw-header-action-btn" onClick={onSecurity}>🛡️ Security</button>
        <button type="button" className="cw-header-action-btn danger" onClick={onReport}>🚩 Report</button>
      </div>
    </div>
  );
}
