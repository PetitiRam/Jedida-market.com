export default function Logo({ size = 40, withWordmark = true, light = false, tagline = false, overrideUrl = null }) {
  const inkColor = light ? '#F6FBF7' : '#10241A';
  const forest = '#0B3D24';
  const forestDark = '#062818';
  const lime = '#8BC53F';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {overrideUrl ? (
        <img src={overrideUrl} alt="Jedida Market" style={{ width: size, height: size, borderRadius: size * 0.25, objectFit: 'cover' }} />
      ) : (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="jedida-mark-bg" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={forest} />
              <stop offset="1" stopColor={forestDark} />
            </linearGradient>
          </defs>
          <rect width="48" height="48" rx="12" fill="url(#jedida-mark-bg)" />
          {/* Bold white J, brand mark */}
          <path
            d="M29.5 10.5V27.5C29.5 32.7467 25.2467 37 20 37C16.4415 37 13.3411 35.0343 11.7405 32.1287"
            stroke="#FFFFFF"
            strokeWidth="6.4"
            strokeLinecap="round"
            fill="none"
          />
          {/* Leaf accent, growth motif */}
          <path
            d="M28 12C28 12 30.8 6.4 37 7.4C37 7.4 36.4 14.4 30.6 15.6C29 15.9 28 14.6 28 12Z"
            fill={lime}
          />
        </svg>
      )}
      {withWordmark && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
          <span style={{
            fontFamily: "'Sora', sans-serif",
            fontWeight: 800,
            fontSize: size * 0.5,
            letterSpacing: '-0.02em',
            color: inkColor
          }}>
            Jedida <span style={{ color: lime, fontWeight: 700 }}>market</span>
          </span>
          {tagline && (
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: size * 0.2,
              letterSpacing: '0.02em',
              color: light ? 'rgba(246,251,247,0.75)' : '#5B6760',
              marginTop: 2
            }}>
              Shop. Sell. Thrive.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
