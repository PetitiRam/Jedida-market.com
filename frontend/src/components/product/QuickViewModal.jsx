import { useEffect } from 'react';
import ProductDetail from '../../pages/buyer/ProductDetail';

export default function QuickViewModal({ product, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!product) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,24,22,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '5vh 16px', overflowY: 'auto', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, maxWidth: 900, width: '100%',
          position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick view"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 34, height: 34, borderRadius: '50%', border: 'none',
            background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            cursor: 'pointer', fontSize: 16,
          }}
        >
          ✕
        </button>
        <ProductDetail previewProduct={product} previewMode />
      </div>
    </div>
  );
}
