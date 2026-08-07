const STATUS_LABELS = {
  pending_payment: 'Payment pending', paid_escrow: 'Paid — in escrow', shipped: 'Shipped',
  delivered_confirmed: 'Delivered', completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed',
};

function timeOf(m) {
  return new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function TextBody({ m, displayBody }) {
  if (m.deleted_for_everyone) return <em style={{ opacity: 0.7 }}>Message deleted</em>;
  if (m.message_type === 'sticker') return <span style={{ fontSize: '1.6rem' }}>{m.body}</span>;
  if (m.message_type === 'image') return <img src={m.attachment_url} alt="attachment" style={{ maxWidth: 200, borderRadius: 10, display: 'block' }} />;
  if (m.message_type === 'video') return <video src={m.attachment_url} controls style={{ maxWidth: 200, borderRadius: 10, display: 'block' }} />;
  if (m.message_type === 'audio') return <audio src={m.attachment_url} controls style={{ maxWidth: 200 }} />;
  if (m.message_type === 'document') {
    return (
      <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit' }}>
        📄 <span style={{ textDecoration: 'underline' }}>{m.attachment_meta?.originalName || 'Document'}</span>
      </a>
    );
  }
  return <>{displayBody(m)}</>;
}

function ProductCard({ meta, onView }) {
  return (
    <div className="cw-product-card">
      {meta.imageUrl && <img className="cw-product-thumb" src={meta.imageUrl} alt={meta.title} />}
      <div className="cw-product-info">
        <div className="cw-product-title">{meta.title}</div>
        <div className="cw-product-meta">
          <span className="cw-product-price">{meta.currency} {meta.price}</span>
          {meta.moq != null && <span>MOQ {meta.moq}</span>}
          {meta.stock != null && <span>{meta.stock > 0 ? `${meta.stock} in stock` : 'Out of stock'}</span>}
        </div>
      </div>
      <button type="button" className="cw-product-btn" onClick={() => onView?.(meta.productId)}>View Product</button>
    </div>
  );
}

function OrderCard({ meta }) {
  return (
    <div className="cw-order-card">
      <div className="cw-order-head">
        <span className="cw-order-id">Order #{String(meta.orderId).slice(0, 8)}</span>
        <span className={`cw-status-pill ${meta.status}`}>{STATUS_LABELS[meta.status] || meta.status}</span>
      </div>
      <div className="cw-order-rows">
        {meta.totalAmount != null && (
          <div className="cw-order-row"><span>Amount</span><b>{meta.currency} {meta.totalAmount}</b></div>
        )}
        {meta.paymentStatus && (
          <div className="cw-order-row"><span>Payment</span><b>{meta.paymentStatus}</b></div>
        )}
        {meta.deliveryStatus && (
          <div className="cw-order-row"><span>Delivery</span><b>{meta.deliveryStatus}</b></div>
        )}
      </div>
    </div>
  );
}

export default function MessageCard({ m, mine, displayBody, onViewProduct, actions }) {
  const isAi = m.is_ai;
  const isSupport = m.is_official && !m.is_ai;
  const rowClass = `cw-msg-row ${mine ? 'mine' : 'theirs'}${isAi ? ' ai' : ''}`;

  let body;
  if (m.message_type === 'product' && m.attachment_meta?.productId) {
    body = <ProductCard meta={m.attachment_meta} onView={onViewProduct} />;
  } else if (m.message_type === 'order' && m.attachment_meta?.orderId) {
    body = <OrderCard meta={m.attachment_meta} />;
  } else {
    body = (
      <div className="cw-msg-card">
        {isAi && <div className="cw-ai-badge">🤖 Jedida AI Assistant</div>}
        {isSupport && <div className="cw-support-badge">✔️ Jedida Representative</div>}
        <TextBody m={m} displayBody={displayBody} />
        {m.moderation_status === 'masked' && (
          <div style={{ fontSize: '0.7rem', color: '#B0790E', marginTop: 6 }}>
            🛡️ Part of this message was hidden to keep communication inside Jedida.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={rowClass}>
      {body}
      <div className="cw-msg-foot">
        <span>{timeOf(m)}</span>
        {m.status === 'read' && <span className="read">✓✓ Read</span>}
        {actions}
      </div>
    </div>
  );
}
