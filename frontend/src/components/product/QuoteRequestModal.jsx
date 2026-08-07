import { useState } from 'react';
import * as commerceApi from '../../api/commerceApi';

export default function QuoteRequestModal({ product, onClose, onSubmitted }) {
  const [requestedQuantity, setRequestedQuantity] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await commerceApi.requestQuote(product.id, {
        requestedQuantity: requestedQuantity ? Number(requestedQuantity) : null,
        targetPrice: targetPrice ? Number(targetPrice) : null,
        message
      });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit quote request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(22,32,27,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', 
zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} className="card-surface" style={{ maxWidth: 420, width: '90%' }}>
        <h3 style={{ marginBottom: 4 }}>Request a Quote</h3>
        <p className="product-card-meta" style={{ marginBottom: 14 }}>For: {product.title}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field-row">
            <div className="field-group">
              <label>Quantity needed</label>
              <input type="number" min="1" value={requestedQuantity} onChange={(e) => setRequestedQuantity(e.target.value)} placeholder="e.g. 500" />
            </div>
            <div className="field-group">
              <label>Target price ({product.currency})</label>
              <input type="number" min="0" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="field-group">
            <label>Additional details</label>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Any specifics the seller should know…" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
