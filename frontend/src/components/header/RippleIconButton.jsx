import { useState } from 'react';

// Icon-only header control. Hover lift/glow and border animation live in
// header.css against the .jd-icon-btn class; this component's own job is
// the click ripple — a droplet that expands from the exact point the user
// tapped, echoing the marketplace's harvest/rain visual language.
export default function RippleIconButton({
  label, active = false, badge = null, onClick, className = '', children, innerRef, showLabel = false
}) {
  const [ripples, setRipples] = useState([]);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    const size = Math.max(rect.width, rect.height) * 2.2;
    setRipples((prev) => [...prev, {
      id, size, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2
    }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 620);
    onClick?.(e);
  };

  if (showLabel) {
    return (
      <button
        ref={innerRef}
        type="button"
        aria-label={label}
        title={label}
        className={`jd-icon-stat ${active ? 'is-active' : ''} ${className}`}
        onClick={handleClick}
      >
        <span className="jd-icon-stat-icon">
          <span className="jd-icon-btn-glyph">{children}</span>
          {badge}
          {ripples.map((r) => (
            <span key={r.id} className="jd-ripple" style={{ width: r.size, height: r.size, left: r.x, top: r.y }} />
          ))}
        </span>
        <span className="jd-icon-stat-label">{label}</span>
      </button>
    );
  }

  return (
    <button
      ref={innerRef}
      type="button"
      aria-label={label}
      title={label}
      className={`jd-icon-btn ${active ? 'is-active' : ''} ${className}`}
      onClick={handleClick}
    >
      <span className="jd-icon-btn-glyph">{children}</span>
      {badge}
      {ripples.map((r) => (
        <span key={r.id} className="jd-ripple" style={{ width: r.size, height: r.size, left: r.x, top: r.y }} />
      ))}
    </button>
  );
}
