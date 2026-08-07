import { useState } from 'react';
import * as b2bApi from '../../api/b2bApi';

// Distinct from the generic QuoteRequestModal (which routes to the admin
// team for regular sellers) — this hits the real B2B quote_requests flow
// (schema_phase41) so a manufacturer/supplier gets it directly and can
// respond with a bulk price the buyer can accept into an order.
export default function B2BQuoteRequestModal({ shopId, shopName, product, onClose, onSubmitted }) {
  const [quantity, setQuantity] = useState(product?.minimum_order_quantity || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!quantity || Number(quantity) <= 0) { setError('Enter a quantity greater than 0.'); return; }
    setBusy(true);
    setError('');
    try {
      await b2bApi.createQuoteRequest({
        shopId,
        productId: product?.id || null,
        quantity: Number(quantity),
        message
      });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send quote request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(22,32,27,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} className="card-surface" style={{ maxWidth: 440, width: '92%' }}>
        <h3 style={{ marginBottom: 4 }}>Request a Quotation</h3>
        <p className="product-card-meta" style={{ marginBottom: 14 }}>
          {product ? `For: ${product.title}` : `General inquiry to ${shopName}`}
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field-group">
            <label>Quantity needed{product?.minimum_order_quantity ? ` (MOQ ${product.minimum_order_quantity})` : ''}</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 500" />
          </div>
          <div className="field-group">
            <label>Details for the business</label>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Specs, destination, timeline…" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
