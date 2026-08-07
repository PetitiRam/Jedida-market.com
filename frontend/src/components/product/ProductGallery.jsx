import { useState, useEffect, useRef, useCallback } from 'react';

export default function ProductGallery({ images = [], videoUrl, view360Url, title }) {
  const media = [...images.map((url) => ({ type: 'image', url })), ...(videoUrl ? [{ type: 'video', url: videoUrl }] : [])];
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomPos, setZoomPos] = useState(null);
  const [show360, setShow360] = useState(false);
  const intervalRef = useRef(null);

  const active = media[activeIndex] || media[0];

  const next = useCallback(() => setActiveIndex((i) => (i + 1) % media.length), [media.length]);
  const prev = useCallback(() => setActiveIndex((i) => (i - 1 + media.length) % media.length), [media.length]);

  useEffect(() => {
    if (paused || fullscreen || media.length < 2) return;
    intervalRef.current = setInterval(next, 4000);
    return () => clearInterval(intervalRef.current);
  }, [paused, fullscreen, next, media.length]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!fullscreen) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fullscreen, next, prev]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  };

  if (media.length === 0) {
    return <div style={{ aspectRatio: '1/1', background: 'var(--cream-dim)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 
'#B8AE93' }}>No image available</div>;
  }

  return (
    <div>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => { setPaused(false); setZoomPos(null); }}
        onMouseMove={handleMouseMove}
        onClick={() => setFullscreen(true)}
        style={{
          position: 'relative', aspectRatio: '1/1', borderRadius: 16, overflow: 'hidden',
          background: 'var(--cream-dim)', cursor: 'zoom-in', boxShadow: '0 8px 24px rgba(22,32,27,0.08)'
        }}
      >
        {active.type === 'video' ? (
          <video src={active.url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <img
            src={active.url} alt={title}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: zoomPos ? 'scale(1.6)' : 'scale(1)',
              transformOrigin: zoomPos ? `${zoomPos.x}% ${zoomPos.y}%` : 'center',
              transition: zoomPos ? 'none' : 'transform 0.2s ease'
            }}
          />
        )}

        {media.length > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); prev(); }} style={navBtnStyle('left')}>‹</button>
            <button onClick={(e) => { e.stopPropagation(); next(); }} style={navBtnStyle('right')}>›</button>
            <div style={counterStyle}>{activeIndex + 1}/{media.length}</div>
          </>
        )}

        {view360Url && (
          <button
            onClick={(e) => { e.stopPropagation(); setShow360(true); }}
            style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(11,61,36,0.85)', color: '#fff', border: 'none', borderRadius: 999, padding: '6px 14px', 
fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            🔄 360° View
          </button>
        )}
      </div>

      {media.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {media.map((m, i) => (
            <button
              key={i} onClick={() => setActiveIndex(i)}
              style={{
                flexShrink: 0, width: 56, height: 56, borderRadius: 8, overflow: 'hidden', padding: 0, cursor: 'pointer',
                border: i === activeIndex ? '2px solid var(--forest)' : '1px solid var(--line)', background: 'var(--cream-dim)'
              }}
            >
              {m.type === 'video' ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▶️</div>
              ) : (
                <img src={m.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {fullscreen && (
        <div
          onClick={() => setFullscreen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,32,27,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <button onClick={(e) => { e.stopPropagation(); prev(); }} style={{ ...navBtnStyle('left'), position: 'absolute' }}>‹</button>
          {active.type === 'video' ? (
            <video src={active.url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={active.url} alt={title} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }} onClick={(e) => e.stopPropagation()} />
          )}
          <button onClick={(e) => { e.stopPropagation(); next(); }} style={{ ...navBtnStyle('right'), position: 'absolute' }}>›</button>
          <button onClick={() => setFullscreen(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 
28, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {show360 && (
        <div onClick={() => setShow360(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(22,32,27,0.92)', zIndex: 1000, display: 'flex', alignItems: 
'center', justifyContent: 'center' }}>
          <iframe src={view360Url} title="360 view" style={{ width: '80vw', height: '80vh', border: 'none', borderRadius: 12 }} />
        </div>
      )}
    </div>
  );
}

const navBtnStyle = (side) => ({
  position: 'absolute', top: '50%', [side]: 8, transform: 'translateY(-50%)',
  width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.9)',
  fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2
});
const counterStyle = {
  position: 'absolute', bottom: 10, right: 10, background: 'rgba(22,32,27,0.7)', color: '#fff',
  fontSize: 12, padding: '3px 10px', borderRadius: 999
};
