import { useState } from 'react';
import Icon from '../icons/icon';

export default function AuthButton({ type = 'submit', disabled, state = 'idle', children, successLabel = 'Success', loadingLabel = 'Please wait…' }) {
  const [ripples, setRipples] = useState([]);

  const addRipple = (e) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = {
      id: Date.now(),
      x: e.clientX - rect.left - size / 2,
      y: e.clientY - rect.top - size / 2,
      size,
    };
    setRipples((r) => [...r, ripple]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== ripple.id)), 620);
  };

  return (
    <button
      type={type}
      className={`jd-btn-primary ${state === 'success' ? 'jd-success' : ''}`}
      disabled={disabled || state === 'loading'}
      onClick={addRipple}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="jd-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
      {state === 'loading' && <Icon name="loader" size={18} className="jd-btn-spin" />}
      {state === 'success' && <Icon name="check" size={18} />}
      <span>{state === 'loading' ? loadingLabel : state === 'success' ? successLabel : children}</span>
    </button>
  );
}
