import { useEffect, useState } from 'react';
import client from '../api/client';

const STAGE_LABEL = { before_packaging: 'Before packaging', during_packaging: 'During packaging', after_packaging: 'Sealed package' };

export default function BuyerPackagingGallery({ orderId }) {
  const [evidence, setEvidence] = useState(null);
  const [packagingStatus, setPackagingStatus] = useState('not_started');

  useEffect(() => {
    client.get(`/orders/${orderId}/packaging/evidence`)
      .then(({ data }) => { setEvidence(data.evidence || []); setPackagingStatus(data.packagingStatus); })
      .catch(() => setEvidence([]));
  }, [orderId]);

  // Nothing to show yet — stay silent rather than showing an empty card;
  // this section only appears once the seller has actually uploaded
  // something (spec #22: the buyer sees this automatically, not a promise
  // of a feature that hasn't produced anything yet).
  if (!evidence || evidence.length === 0) return null;

  return (
    <div className="card-surface" style={{ marginBottom: 16 }}>
      <strong>Seller has packed your order</strong>
      <div style={{ fontSize: '0.8rem', color: '#8A968E', marginBottom: 10 }}>
        {packagingStatus === 'handed_to_logistics' ? 'Handed to logistics' : 'Packaging in progress'}
      </div>
      {['before_packaging', 'during_packaging', 'after_packaging'].map((stage) => {
        const items = evidence.filter((e) => e.stage === stage && !e.superseded_by);
        if (items.length === 0) return null;
        return (
          <div key={stage} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#5B6760', marginBottom: 6 }}>{STAGE_LABEL[stage]}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {items.map((e) => (
                <img key={e.id} src={e.image_url} alt={e.caption || STAGE_LABEL[stage]} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
