import Icon from "../icons/icon";

const STATUS_CONFIG = {
  pending: {
    label: "Pending Payment",
    icon: "clock",
    className: "jp-status-pending",
    desc: "Waiting for you to complete payment and submit your reference.",
    wait: "Action needed from you"
  },
  submitted: {
    label: "Payment Submitted",
    icon: "checkCircle",
    className: "jp-status-submitted",
    desc: "Your payment details were received and are queued for review.",
    wait: "Usually reviewed within 1–3 hours"
  },
  under_verification: {
    label: "Under Verification",
    icon: "refresh",
    className: "jp-status-verifying",
    desc: "Our team is confirming your payment against the transaction record.",
    wait: "Usually completes within 1–3 hours"
  },
  approved: {
    label: "Approved",
    icon: "checkCircle",
    className: "jp-status-approved",
    desc: "Payment verified. Your funds are held safely in escrow.",
    wait: "Order is now being prepared"
  },
  rejected: {
    label: "Rejected",
    icon: "alertCircle",
    className: "jp-status-rejected",
    desc: "We couldn't verify this payment. Please review and resubmit.",
    wait: "Contact support if this looks wrong"
  },
  refunded: {
    label: "Refunded",
    icon: "refresh",
    className: "jp-status-refunded",
    desc: "This payment has been refunded back to you.",
    wait: "Refunds typically settle within 3–5 days"
  }
};

const BADGE_COLORS = {
  pending: { bg: "#FCEFD8", fg: "#8A5A0D" },
  submitted: { bg: "#FCEFD8", fg: "#8A5A0D" },
  under_verification: { bg: "#E4EEFB", fg: "#1D5FAE" },
  approved: { bg: "#E7F7F1", fg: "#0B7A56" },
  rejected: { bg: "#FBE3DA", fg: "#C0392B" },
  refunded: { bg: "#F1E9FB", fg: "#6A3FB0" }
};

export function PaymentStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const colors = BADGE_COLORS[status] || BADGE_COLORS.pending;
  return (
    <span className="jp-badge" style={{ background: colors.bg, color: colors.fg }}>
      {cfg.label}
    </span>
  );
}

export default function PaymentStatusCard({ status = "pending", lastUpdated, timeline = [] }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <div className={`jp-status-card ${cfg.className}`}>
      <div className="jp-status-icon">
        <Icon name={cfg.icon} size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="jp-status-title-row">
          <span className="jp-status-title">{cfg.label}</span>
        </div>
        <div className="jp-status-desc">{cfg.desc}</div>
        <div className="jp-status-updated">
          {lastUpdated ? `Last updated ${lastUpdated}` : cfg.wait}
        </div>

        {timeline.length > 0 && (
          <div className="jp-timeline">
            {timeline.map((step, i) => (
              <div className="jp-timeline-item" key={i}>
                <div className="jp-timeline-rail">
                  <div className={`jp-timeline-dot${step.done ? " is-done" : ""}${step.active ? " is-active" : ""}`} />
                  {i < timeline.length - 1 && <div className={`jp-timeline-line${step.done ? " is-done" : ""}`} />}
                </div>
                <div className="jp-timeline-body">
                  <div className="jp-timeline-label">{step.label}</div>
                  {step.time && <div className="jp-timeline-time">{step.time}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
