import { useEffect, useRef, useState } from "react";
import client from "../api/client";
import { PAYMENT_METHODS } from "../constants/paymentMethods";
import Icon from "./icons/icon";
import "../styles/payment-forms.css";

const LOGOS = {
  mtn_mobile_money:
    "https://upload.wikimedia.org/wikipedia/commons/9/93/New-mtn-logo.jpg",
  airtel_money:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Airtel_logo.svg/512px-Airtel_logo.svg.png",
  card:
    "https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg",
  paypal:
    "https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg",
  bank:
    "https://cdn-icons-png.flaticon.com/512/2830/2830284.png",
  crypto:
    "https://upload.wikimedia.org/wikipedia/commons/4/46/Bitcoin.svg"
};

const DESCRIPTIONS = {
  mtn_mobile_money: "Pay via MTN MoMo",
  airtel_money: "Pay via Airtel Money",
  card: "Cards coming soon",
  paypal: "Pay via PayPal",
  bank: "Direct bank transfer",
  crypto: "Pay with crypto"
};

const PROCESSING_TIME = {
  mtn_mobile_money: "Instant – 5 mins",
  airtel_money: "Instant – 5 mins",
  bank: "1 – 2 hours",
  card: "Coming soon",
  paypal: "Coming soon",
  crypto: "Coming soon"
};

// Maps each listed payment method to the admin toggle that actually
// controls it. Methods with no toggle here (paypal, crypto) have no
// admin-facing "enable" control yet, so they stay off until one exists.
const AVAILABILITY_KEY = {
  mtn_mobile_money: 'enableMobileMoney',
  airtel_money: 'enableMobileMoney',
  bank: 'enableBankTransfer',
  card: 'enableCardPayments',
};

function MethodCard({ method, selected, available, onSelect, delay }) {
  const [ripples, setRipples] = useState([]);

  const spawnRipple = (e) => {
    if (!available) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    const ripple = { id: Date.now(), x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size };
    setRipples((r) => [...r, ripple]);
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== ripple.id)), 620);
  };

  return (
    <div
      className={`jp-method-card${selected ? " is-selected" : ""}${!available ? " is-disabled" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={(e) => { if (available) { spawnRipple(e); onSelect(method.id); } }}
      role="radio"
      aria-checked={selected}
      tabIndex={available ? 0 : -1}
      onKeyDown={(e) => { if (available && (e.key === "Enter" || e.key === " ")) onSelect(method.id); }}
    >
      {ripples.map((r) => (
        <span key={r.id} className="jp-ripple" style={{ left: r.x, top: r.y, width: r.size, height: r.size }} />
      ))}

      {selected && (
        <span className="jp-method-check">
          <Icon name="check" size={13} />
        </span>
      )}

      <div className="jp-method-logo">
        <img src={LOGOS[method.id] || method.logo} alt={method.label} />
      </div>

      <div className="jp-method-name">{method.label}</div>
      <div className="jp-method-desc">{DESCRIPTIONS[method.id] || method.network || ""}</div>

      <div className="jp-method-meta">
        <Icon name="clock" size={12} />
        {PROCESSING_TIME[method.id] || "—"}
      </div>

      {available ? (
        <span className="jp-badge jp-badge-secure">
          <Icon name="lock" size={11} /> No Fees
        </span>
      ) : (
        <span className="jp-badge jp-badge-soon">Coming Soon</span>
      )}
    </div>
  );
}

export default function PaymentMethodPicker({ value, onChange }) {
  const [settings, setSettings] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    client.get('/admin/settings-center/public/payment-methods')
      .then(({ data }) => setSettings(data))
      .catch(() => setSettings({})) // fail closed — methods stay "coming soon" rather than falsely available
      .finally(() => { loaded.current = true; });
  }, []);

  const isAvailable = (method) => {
    const key = AVAILABILITY_KEY[method.id];
    if (!key) return false; // no admin control for this one yet — never claim it's live
    if (!settings) return false; // still loading — don't flash a false "available" state
    return !!settings[key];
  };

  if (!settings) {
    return (
      <div className="jp-scope jp-method-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="jp-skeleton" style={{ height: 168, borderRadius: 18 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="jp-scope jp-method-grid" role="radiogroup" aria-label="Payment method">
      {PAYMENT_METHODS.map((m, i) => (
        <MethodCard
          key={m.id}
          method={m}
          selected={value === m.id}
          available={isAvailable(m)}
          onSelect={onChange}
          delay={i * 45}
        />
      ))}
    </div>
  );
}
