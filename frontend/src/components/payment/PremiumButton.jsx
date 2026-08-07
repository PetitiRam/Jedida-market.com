import { useState } from "react";
import Icon from "../icons/icon";

/**
 * Premium button used across the payment forms.
 * variant: primary | secondary | ghost | danger
 * state:   idle | loading | success | error (controlled by parent via props)
 */
export default function PremiumButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
  loading = false,
  success = false,
  error = false,
  icon = null,
  style,
  className = ""
}) {
  const [ripples, setRipples] = useState([]);

  const spawnRipple = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const ripple = {
      id: Date.now(),
      x: e.clientX - rect.left - size / 2,
      y: e.clientY - rect.top - size / 2,
      size
    };
    setRipples((r) => [...r, ripple]);
    setTimeout(() => {
      setRipples((r) => r.filter((rp) => rp.id !== ripple.id));
    }, 600);
  };

  const handleClick = (e) => {
    if (disabled || loading) return;
    spawnRipple(e);
    onClick?.(e);
  };

  const variantClass =
    success ? "jp-btn-success"
    : error ? "jp-btn-danger"
    : variant === "secondary" ? "jp-btn-secondary"
    : variant === "ghost" ? "jp-btn-ghost"
    : variant === "danger" ? "jp-btn-danger"
    : "jp-btn-primary";

  return (
    <button
      type={type}
      className={`jp-btn ${variantClass} ${className}`}
      onClick={handleClick}
      disabled={disabled || loading}
      style={style}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="jp-btn-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}

      {loading && <span className="jp-btn-spinner" />}
      {!loading && success && <Icon name="checkCircle" size={18} />}
      {!loading && error && <Icon name="alertCircle" size={18} />}
      {!loading && !success && !error && icon}

      <span>{children}</span>
    </button>
  );
}
